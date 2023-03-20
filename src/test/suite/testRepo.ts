import "mocha";
import * as assert from "assert";
import { Uri, extensions } from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import { Model } from "../../model";
import { eventToPromise } from "../../util";
import { Repository } from "../../repository";

export interface TestRepoOpts {
    preserveOpenedRepos?: boolean;
}

export class TestRepo {
    static async setup({
        preserveOpenedRepos,
    }: TestRepoOpts): Promise<TestRepo> {
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

    writeFile(relativeName: string, content: string) {
        fs.writeFileSync(path.join(this.dir, relativeName), content, "utf8");
    }

    removeFile(relativeName: string, content: string) {
        fs.unlinkSync(path.join(this.dir, relativeName));
    }

    hg(hgCmd: string): string {
        return cp
            .execSync(`hg ${hgCmd}`, { cwd: this.dir, encoding: "utf8" })
            .toString();
    }
}
