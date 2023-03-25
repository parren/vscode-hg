import * as assert from "assert";
import * as path from "path";
import "mocha";
import * as vscode from "vscode";
import { TestRepo } from "./testRepo";
import { Resource, Status } from "../../repository";
import { fromHgUri } from "../../uri";

// See https://code.visualstudio.com/api/working-with-extensions/testing-extension

suite("parent change", () => {
    let env: TestRepo;

    setup(async function () {
        await vscode.commands.executeCommand("openEditors.closeAll");
        env = await TestRepo.setup({});
    });

    function parentResource(name: string) {
        return env.repo.parentGroup.resources.find(
            (r) => path.basename(r.resourceUri.path) == name
        )!;
    }

    function statusesByName(): { [name: string]: Status } {
        let result: { [name: string]: Status } = {};
        for (let r of env.repo.parentGroup.resources) {
            result[path.basename(r.resourceUri.path)] = r.status;
        }
        return result;
    }

    async function open(r: Resource) {
        await openWith(r.command.command, r);
    }

    async function openWith(command: string, r: Resource) {
        await vscode.commands.executeCommand(command, ...r.command.arguments!);
    }

    function documents(): string[] {
        let ref = function (uri: vscode.Uri): string {
            if (!uri.query) return "";
            const { path, ref } = fromHgUri(uri);
            return ref ? `@${ref}` : "";
        };
        return vscode.workspace.textDocuments
            .filter((d) => d.uri.scheme != "vscode-scm")
            .map((d) => {
                let p = `${d.uri.scheme}:${path.basename(d.uri.path)}`;
                let r = ref(d.uri);
                let t = d.getText();
                return `${p}${r} => ${t}`;
            });
    }

    suite("in empty repo", function () {
        test("is empty for a clean wdir", async function () {
            const repo = env.repo;
            await vscode.commands.executeCommand("workbench.view.scm");
            await repo.status();
            assert.strictEqual(repo.parentGroup.resources.length, 0);
        });

        test("is empty with wdir changes", async function () {
            env.write("wdir");

            const repo = env.repo;
            await vscode.commands.executeCommand("workbench.view.scm");
            await repo.status();
            assert.strictEqual(repo.parentGroup.resources.length, 0);
        });
    });

    suite("in repo with one commit", function () {
        setup(function () {
            env.write("committed1");
            env.write("committed2");
            env.hg("add .");
            env.hg("commit --message A");

            env.write("untrackedWdir");
            env.write("addedWdir");
            env.hg("add addedWdir");
        });

        test("lists added parent files as added", async function () {
            const repo = env.repo;
            await vscode.commands.executeCommand("workbench.view.scm");
            await repo.status();
            assert.deepStrictEqual(statusesByName(), {
                committed1: Status.ADDED,
                committed2: Status.ADDED,
            });
        });
    });

    suite("in repo with two commits", function () {
        setup(async function () {
            env.write("unmodified");
            env.write("modified");
            env.write("modifiedInWdir");
            env.write("modifiedInBoth");
            env.write("removed");
            env.write("removedInWdir");
            env.write("toBeRenamed");
            env.write("toBeRenamedInWdir");
            env.write("toBeRenamedInBoth");
            env.hg("add .");
            env.hg("commit --message A");

            env.write("modified", { content: "modified in parent" });
            env.write("modifiedInBoth", { content: "modified in parent" });
            env.hg("rm removed");
            env.hg("mv toBeRenamed renamed");
            env.write("renamed", { content: "renamed in parent" });
            env.hg("mv toBeRenamedInBoth renamedInParent");
            env.write("renamedInParent", { content: "renamed in parent" });
            env.write("added");
            env.hg("add added");
            env.hg("commit --message B");

            env.write("modifiedInWdir", { content: "modified in wdir" });
            env.write("modifiedInBoth", { content: "modified in wdir" });
            env.hg("rm removedInWdir");
            env.hg("mv toBeRenamedInWdir renamedInWdir");
            env.write("renamedInWdir", { content: "renamed in wdir" });
            env.hg("mv renamedInParent renamedInBoth");
            env.write("renamedInBoth", { content: "renamed in wdir" });

            await vscode.commands.executeCommand("workbench.view.scm");
            await env.repo.status();
        });

        test("lists parent files correctly", async function () {
            assert.deepStrictEqual(statusesByName(), {
                added: Status.ADDED,
                modified: Status.MODIFIED,
                modifiedInBoth: Status.MODIFIED,
                removed: Status.DELETED,
                renamed: Status.RENAMED,
                renamedInParent: Status.RENAMED,
                toBeRenamed: Status.DELETED,
                toBeRenamedInBoth: Status.DELETED,
            });
        });

        test("shows added parent diff", async function () {
            await open(parentResource("added"));
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "content of added"
            );
            assert.deepStrictEqual(documents(), [
                "file:added => content of added",
            ]);
        });

        test("shows modified parent diff", async function () {
            await openWith("hg.openChange", parentResource("modified"));
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "modified in parent"
            );
            assert.deepStrictEqual(documents(), [
                "file:modified => modified in parent",
                "hg:modified@.^ => content of modified",
            ]);

            await vscode.commands.executeCommand("openEditors.closeAll");

            await openWith("hg.openParentChange", parentResource("modified"));
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "modified in parent"
            );
            assert.deepStrictEqual(documents(), [
                "hg:modified@. => modified in parent",
                "hg:modified@.^ => content of modified",
            ]);
        });

        test("shows modified parent and wdir diff", async function () {
            await openWith("hg.openChange", parentResource("modifiedInBoth"));
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "modified in wdir"
            );
            assert.deepStrictEqual(documents(), [
                "file:modifiedInBoth => modified in wdir",
                "hg:modifiedInBoth@.^ => content of modifiedInBoth",
            ]);

            await vscode.commands.executeCommand("openEditors.closeAll");

            await openWith(
                "hg.openParentChange",
                parentResource("modifiedInBoth")
            );
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "modified in parent"
            );
            assert.deepStrictEqual(documents(), [
                "hg:modifiedInBoth@. => modified in parent",
                "hg:modifiedInBoth@.^ => content of modifiedInBoth",
            ]);
        });

        test("shows renamed parent diff", async function () {
            await openWith("hg.openChange", parentResource("renamed"));
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "renamed in parent"
            );
            assert.deepStrictEqual(documents(), [
                "file:renamed => renamed in parent",
                "hg:toBeRenamed@.^ => content of toBeRenamed",
            ]);

            await vscode.commands.executeCommand("openEditors.closeAll");

            await openWith("hg.openParentChange", parentResource("renamed"));
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "renamed in parent"
            );
            assert.deepStrictEqual(documents(), [
                "hg:renamed@. => renamed in parent",
                "hg:toBeRenamed@.^ => content of toBeRenamed",
            ]);
        });

        test("shows renamed parent and wdir diff", async function () {
            // We currently don't handle parent + wdir renames correctly.
            // The diff from parent to wdir fails to open. So we don't test it here.

            await openWith(
                "hg.openParentChange",
                parentResource("renamedInParent")
            );
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "renamed in parent"
            );
            assert.deepStrictEqual(documents(), [
                "hg:renamedInParent@. => renamed in parent",
                "hg:toBeRenamedInBoth@.^ => content of toBeRenamedInBoth",
            ]);
        });

        test("shows removed parent diff", async function () {
            await openWith("hg.openChange", parentResource("removed"));
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "content of removed"
            );
            assert.deepStrictEqual(documents(), [
                "hg:removed@.^ => content of removed",
            ]);

            await vscode.commands.executeCommand("openEditors.closeAll");

            await openWith("hg.openParentChange", parentResource("removed"));
            assert.strictEqual(
                vscode.window.activeTextEditor?.document.getText(),
                "content of removed"
            );
            assert.deepStrictEqual(documents(), [
                "hg:removed@.^ => content of removed",
            ]);
        });
    });
});
