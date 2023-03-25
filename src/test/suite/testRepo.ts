import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import "mocha";
import * as path from "path";
import * as tmp from "tmp";
import { commands, extensions, Uri } from "vscode";
import { Model } from "../../model";
import { Repository, Resource, Status } from "../../repository";
import { eventToPromise } from "../../util";

export interface TestRepoOpts {
    preserveOpenedRepos?: boolean;
}

export class TestRepo {
    static async setup({
        preserveOpenedRepos,
    }: TestRepoOpts): Promise<TestRepo> {
        await commands.executeCommand("openEditors.closeAll");

        const ext = extensions.getExtension("mrcrowl.hg");
        const model = await ext!.activate();
        if (!preserveOpenedRepos) {
            while (model.repositories.length > 0) {
                model.close(model.repositories[0]);
            }
        }
        const prevReposLen = model.repositories.length;
        // Create temp dir for new repository.
        tmp.setGracefulCleanup();
        const tmpDir = tmp.dirSync().name;
        const tmpDirUri = Uri.file(tmpDir);
        const dir = fs.realpathSync(tmpDirUri.fsPath);
        cp.execSync("hg init", { cwd: dir });
        // Open the repository in vscode.
        model.tryOpenRepository(dir);
        if (model.repositories.length <= prevReposLen) {
            await eventToPromise(model.onDidOpenRepository);
        }
        assert.strictEqual(model.repositories.length, prevReposLen + 1);
        const repo = model.repositories[prevReposLen];
        assert.strictEqual(fs.realpathSync(repo.root), dir);

        return new TestRepo(model, repo, dir);
    }

    constructor(
        public readonly model: Model,
        public readonly repo: Repository,
        public readonly dir: string
    ) {}

    write(name: string, opts?: { content?: string }) {
        let content = opts?.content || `original ${name}`;
        fs.writeFileSync(this.path(name), content, "utf8");
    }

    remove(name: string) {
        fs.unlinkSync(this.path(name));
    }

    rename(oldName: string, newName: string) {
        fs.renameSync(this.path(oldName), this.path(newName));
    }

    hg(hgCmd: string): string {
        return cp
            .execSync(`hg ${hgCmd}`, { cwd: this.dir, encoding: "utf8" })
            .toString();
    }

    parentResource(name: string) {
        return this.namedResource(this.repo.parentGroup.resources, name);
    }

    namedResource(resources: Resource[], name: string) {
        return resources.find(
            (r) => path.basename(r.resourceUri.path) == name
        )!;
    }

    parentStatusesByName(): { [name: string]: Status } {
        return this.statusesByName(this.repo.parentGroup.resources);
    }

    statusesByName(resources: Resource[]): { [name: string]: Status } {
        let result: { [name: string]: Status } = {};
        for (let r of resources) {
            result[path.basename(r.resourceUri.path)] = r.status;
        }
        return result;
    }

    private path(name: string): string {
        return path.join(this.dir, name);
    }
}
