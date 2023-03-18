import { HgError, IFileStatus, IRepoStatus } from "./hg";
import { Uri, SourceControlResourceGroup, SourceControl } from "vscode";
import * as path from "path";
import * as nls from "vscode-nls";
import * as fs from "fs";
import { Resource, Status, MergeStatus } from "./repository";
import { toHgUri } from "./uri";

const localize = nls.loadMessageBundle();

export interface IGroupStatusesParams {
    respositoryRoot: string;
    statusGroups: IStatusGroups;
    fileStatuses: IFileStatus[];
    parentStatuses: IFileStatus[];
    repoStatus: IRepoStatus;
    resolveStatuses: IFileStatus[] | undefined;
}

export interface IStatusGroups {
    conflict: ConflictGroup;
    staging: StagingGroup;
    merge: MergeGroup;
    working: WorkingDirectoryGroup;
    untracked: UntrackedGroup;
    parent: ParentGroup;
}

export type ResourceGroupId = keyof IStatusGroups;

export function createEmptyStatusGroups(
    scm: SourceControl
): [IStatusGroups, SourceControlResourceGroup[]] {
    const conflictGroup = scm.createResourceGroup(
        ConflictGroup.ID,
        localize("merge conflicts", "Unresolved Conflicts")
    );
    const stagingGroup = scm.createResourceGroup(
        StagingGroup.ID,
        localize("staged changes", "Staged Changes")
    );
    const mergeGroup = scm.createResourceGroup(
        MergeGroup.ID,
        localize("merged changes", "Merged Changes")
    );
    const workingGroup = scm.createResourceGroup(
        WorkingDirectoryGroup.ID,
        localize("changes", "Changes")
    );
    const untrackedGroup = scm.createResourceGroup(
        UntrackedGroup.ID,
        localize("untracked files", "Untracked Files")
    );
    const parentGroup = scm.createResourceGroup(
        ParentGroup.ID,
        localize("parent changes", "Parent Changes")
    );

    return [
        {
            conflict: new ConflictGroup(conflictGroup, []),
            staging: new StagingGroup(stagingGroup, []),
            merge: new MergeGroup(mergeGroup, []),
            working: new WorkingDirectoryGroup(workingGroup, []),
            untracked: new UntrackedGroup(untrackedGroup, []),
            parent: new ParentGroup(parentGroup, []),
        },
        [conflictGroup, stagingGroup, mergeGroup, workingGroup, untrackedGroup, parentGroup],
    ];
}

export class ResourceGroup {
    get resourceGroup(): SourceControlResourceGroup {
        return this._resourceGroup;
    }
    get id(): ResourceGroupId {
        return this._resourceGroup.id as ResourceGroupId;
    }
    get contextKey(): string {
        return this._resourceGroup.id;
    }
    get label(): string {
        return this._resourceGroup.label;
    }
    get resources(): Resource[] {
        return this._resources;
    }

    public clear(): void {
        this._resources = [];
    }

    private _resourceUriIndex: Map<string, Resource>;

    constructor(
        private readonly _resourceGroup: SourceControlResourceGroup,
        private _resources: Resource[]
    ) {
        _resourceGroup.resourceStates = _resources;
        _resourceGroup.hideWhenEmpty = true;

        this._resourceUriIndex = ResourceGroup.indexResources(_resources);
    }

    private static indexResources(
        resources: Resource[]
    ): Map<string, Resource> {
        const index = new Map<string, Resource>();
        resources.forEach((r) => index.set(r.resourceUri.toString(), r));
        return index;
    }

    getResource(uri: Uri): Resource | undefined {
        const uriString = uri.toString();
        return this._resourceUriIndex.get(uriString);
    }

    includes(resource: Resource): boolean {
        return this.includesUri(resource.resourceUri);
    }

    includesUri(uri: Uri): boolean {
        return this._resourceUriIndex.has(uri.toString());
    }

    intersect(resources: Resource[]): this {
        const newUniqueResources = resources
            .filter((r) => !this.includes(r))
            .map(
                (r) =>
                    new Resource(this, r.resourceUri, r.status, r.mergeStatus)
            );
        const intersectionResources: Resource[] = [
            ...this.resources,
            ...newUniqueResources,
        ];
        return this.newResourceGroup(intersectionResources);
    }

    except(resources: Resource[]): this {
        const excludeIndex = ResourceGroup.indexResources(resources);
        const remainingResources = this.resources.filter(
            (r) => !excludeIndex.has(r.resourceUri.toString())
        );
        return this.newResourceGroup(remainingResources);
    }

    private newResourceGroup(resources: Resource[]): this {
        const SubClassConstructor = Object.getPrototypeOf(this).constructor;
        return new SubClassConstructor(this._resourceGroup, resources);
    }
}

export class MergeGroup extends ResourceGroup {
    static readonly ID = "merge";
}

export class ConflictGroup extends ResourceGroup {
    static readonly ID = "conflict";
}

export class StagingGroup extends ResourceGroup {
    static readonly ID = "staging";
}

export class UntrackedGroup extends ResourceGroup {
    static readonly ID = "untracked";
}

export class WorkingDirectoryGroup extends ResourceGroup {
    static readonly ID = "working";
}

export class ParentGroup extends ResourceGroup {
    static readonly ID = "parent";
}

export function groupStatuses({
    respositoryRoot,
    statusGroups: { conflict, staging, merge, working, untracked, parent },
    fileStatuses,
    parentStatuses,
    repoStatus,
    resolveStatuses,
}: IGroupStatusesParams): IStatusGroups {
    const parentResources: Resource[] = [];
    const workingDirectoryResources: Resource[] = [];
    const stagingResources: Resource[] = [];
    const conflictResources: Resource[] = [];
    const mergeResources: Resource[] = [];
    const untrackedResources: Resource[] = [];

    const translateStatus = (rawStatus: string, renamed: boolean): Status => {
        switch (rawStatus) {
            case "M":
                return Status.MODIFIED;
            case "R":
                return Status.DELETED;
            case "I":
                return Status.IGNORED;
            case "?":
                return Status.UNTRACKED;
            case "!":
                return Status.MISSING;
            case "A":
                return renamed ? Status.RENAMED : Status.ADDED;
            case "C":
                return Status.CLEAN;
            default:
                throw new HgError({
                    message: "Unknown rawStatus: " + rawStatus,
                });
        }
    }

    const chooseResourcesAndGroup = (
        uriString: string,
        rawStatus: string,
        mergeStatus: MergeStatus,
        renamed: boolean
    ): [Resource[], ResourceGroup, Status] => {
        const status = translateStatus(rawStatus, renamed);

        if (status === Status.IGNORED || status === Status.UNTRACKED) {
            return [untrackedResources, untracked, status];
        }

        if (repoStatus.isMerge) {
            if (mergeStatus === MergeStatus.UNRESOLVED) {
                return [conflictResources, conflict, status];
            }
            return [mergeResources, merge, status];
        }

        const isStaged = staging.resources.some(
            (resource) => resource.resourceUri.toString() === uriString
        );
        const targetResources: Resource[] = isStaged
            ? stagingResources
            : workingDirectoryResources;
        const targetGroup: ResourceGroup = isStaged ? staging : working;
        return [targetResources, targetGroup, status];
    };

    const seenParentUriStrings: Map<string, boolean> = new Map();
    for (const raw of parentStatuses) {
        const uri = Uri.file(path.join(respositoryRoot, raw.path));
        const uriString = uri.toString();
        seenParentUriStrings.set(uriString, true);
        const renameUri = raw.rename
            ? Uri.file(path.join(respositoryRoot, raw.rename))
            : undefined;
        const status = translateStatus(raw.status, !!raw.rename);
        parentResources.push(
            new Resource(parent, uri, status, MergeStatus.NONE, renameUri,
                ".^", "", " (vs Parent)")
        );
    }

    const seenUriStrings: Map<string, boolean> = new Map();
    for (const raw of fileStatuses) {
        const uri = Uri.file(path.join(respositoryRoot, raw.path));
        const uriString = uri.toString();
        seenUriStrings.set(uriString, true);
        const renameUri = raw.rename
            ? Uri.file(path.join(respositoryRoot, raw.rename))
            : undefined;
        const resolveFile =
            resolveStatuses &&
            resolveStatuses.filter((res) => res.path === raw.path)[0];
        const mergeStatus = resolveFile
            ? toMergeStatus(resolveFile.status)
            : MergeStatus.NONE;
        const [resources, group, status] = chooseResourcesAndGroup(
            uriString,
            raw.status,
            mergeStatus,
            !!raw.rename
        );
        resources.push(
            new Resource(group, uri, status, mergeStatus, renameUri)
        );
    }

    // it is possible for a clean file to need resolved
    // e.g. when local changed and other deleted
    if (resolveStatuses) {
        for (const raw of resolveStatuses) {
            const uri = Uri.file(path.join(respositoryRoot, raw.path));
            const uriString = uri.toString();
            if (seenUriStrings.has(uriString)) {
                continue; // dealt with by the fileStatuses (this is the norm)
            }
            const mergeStatus = toMergeStatus(raw.status);
            const inferredStatus: string = fs.existsSync(uri.fsPath)
                ? "C"
                : "R";
            const [resources, group, status] = chooseResourcesAndGroup(
                uriString,
                inferredStatus,
                mergeStatus,
                !!raw.rename
            );
            resources.push(new Resource(group, uri, status, mergeStatus));
        }
    }

    return {
        conflict: new ConflictGroup(conflict.resourceGroup, conflictResources),
        merge: new MergeGroup(merge.resourceGroup, mergeResources),
        staging: new StagingGroup(staging.resourceGroup, stagingResources),
        working: new WorkingDirectoryGroup(
            working.resourceGroup,
            workingDirectoryResources
        ),
        untracked: new UntrackedGroup(
            untracked.resourceGroup,
            untrackedResources
        ),
        parent: new ParentGroup(parent.resourceGroup, parentResources),
    };
}

function toMergeStatus(status: string): MergeStatus {
    switch (status) {
        case "R":
            return MergeStatus.RESOLVED;
        case "U":
            return MergeStatus.UNRESOLVED;
        default:
            return MergeStatus.NONE;
    }
}

export const isResourceGroup = (obj: any): obj is SourceControlResourceGroup =>
    (<SourceControlResourceGroup>obj).resourceStates !== undefined;
