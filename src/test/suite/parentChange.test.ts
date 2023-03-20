import * as assert from "assert";
import * as path from "path";
import "mocha";
import { commands } from "vscode";
import { TestRepo } from "./testRepo";

suite("parent change", () => {
    let env: TestRepo;

    setup(async function () {
        env = await TestRepo.setup({});
    });

    test("is empty for an empty repo", async function () {
        const repo = env.repo;

        await commands.executeCommand("workbench.view.scm");
        await repo.status();
        assert.strictEqual(repo.parentGroup.resources.length, 0);
    });

    test("lists added files as added", async function () {
        env.writeFile("foo.txt", "foo");
        env.writeFile("bar.txt", "bar");
        env.hg("add .");
        env.hg("commit --message 'test'");

        const repo = env.repo;
        await commands.executeCommand("workbench.view.scm");
        await repo.status();
        assert.deepStrictEqual(
            repo.parentGroup.resources
                .map((r) => r.resourceUri.path)
                .map((p) => path.basename(p))
                .sort(),
            ["bar.txt", "foo.txt"]
        );
    });
});
