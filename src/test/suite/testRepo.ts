import "mocha";
import * as assert from "assert";
import { Uri, extensions } from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as tmp from "tmp";
import { Model } from "../../model";
import { eventToPromise } from "../../util";
import { Repository } from "../../repository";

export interface TestRepo {
    model: Model;
    repo: Repository;
    dir: string;
}

export async function setupTestRepo(): Promise<TestRepo> {
    tmp.setGracefulCleanup();
    const testWorkspace = tmp.dirSync().name;
    console.info(`Using workspace: ${testWorkspace}`);
    const testWorkspaceUri = Uri.file(testWorkspace);
    const dir = fs.realpathSync(testWorkspaceUri.fsPath);
    cp.execSync("hg init", { cwd: dir });

    const ext = extensions.getExtension("mrcrowl.hg");
    const model = await ext?.activate();
    model.tryOpenRepository(dir);
    if (model.repositories.length === 0) {
        await eventToPromise(model.onDidOpenRepository);
    }
    assert.strictEqual(model.repositories.length, 1);
    const repo = model.repositories[0];
    assert.strictEqual(fs.realpathSync(repo.root), dir);

    return { model: model, repo: repo, dir: dir };
}

export async function teardownTestRepo(testRepo?: TestRepo): Promise<void> {
    if (testRepo) {
        testRepo.model.close(testRepo.repo);
    }
}
