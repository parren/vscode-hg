import * as assert from "assert";
import "mocha";
import * as vscode from "vscode";
import { openOnly, openEditor, OpenEditor } from "./vscodeUtils";
import { Status } from "../../repository";
import { TestRepo } from "./testRepo";

// See https://code.visualstudio.com/api/working-with-extensions/testing-extension

suite("parent change", () => {
    let env: TestRepo;

    setup(async function () {
        await vscode.commands.executeCommand("openEditors.closeAll");
        env = await TestRepo.setup({});
    });

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
            env.write("addWdir");
            env.hg("add addWdir");
        });

        test("lists add parent files as add", async function () {
            const repo = env.repo;
            await vscode.commands.executeCommand("workbench.view.scm");
            await repo.status();
            assert.deepStrictEqual(env.parentStatusesByName(), {
                committed1: Status.ADDED,
                committed2: Status.ADDED,
            });
        });
    });

    suite("in repo with two commits", function () {
        setup(async function () {
            env.write("unmod");
            env.write("mod");
            env.write("modInWdir");
            env.write("modInBoth");
            env.write("del");
            env.write("delInWdir");
            env.write("toBeRen");
            env.write("toBeRenInWdir");
            env.write("toBeRenInBoth");
            env.hg("add .");
            env.hg("commit --message A");

            env.write("mod", { content: "mod in parent" });
            env.write("modInBoth", { content: "mod in parent" });
            env.hg("rm del");
            env.hg("mv toBeRen ren");
            env.write("ren", { content: "ren in parent" });
            env.hg("mv toBeRenInBoth renInParent");
            env.write("renInParent", { content: "ren in parent" });
            env.write("add");
            env.hg("add add");
            env.hg("commit --message B");

            env.write("modInWdir", { content: "mod in wdir" });
            env.write("modInBoth", { content: "mod in wdir" });
            env.hg("rm delInWdir");
            env.hg("mv toBeRenInWdir renInWdir");
            env.write("renInWdir", { content: "ren in wdir" });
            env.hg("mv renInParent renInBoth");
            env.write("renInBoth", { content: "ren in wdir" });

            await vscode.commands.executeCommand("workbench.view.scm");
            await env.repo.status();
        });

        test("lists parent files correctly", async function () {
            assert.deepStrictEqual(env.parentStatusesByName(), {
                add: Status.ADDED,
                mod: Status.MODIFIED,
                modInBoth: Status.MODIFIED,
                del: Status.DELETED,
                ren: Status.RENAMED,
                renInParent: Status.RENAMED,
                toBeRen: Status.DELETED,
                toBeRenInBoth: Status.DELETED,
            });
        });

        test("shows add parent diff", async function () {
            await openOnly(env.parentResource("add"));
            assert.deepStrictEqual(openEditor(), {
                only: { uri: "file:add", text: "original add" },
            } as OpenEditor);
        });

        test("shows mod parent diff", async function () {
            await openOnly(env.parentResource("mod"));
            assert.deepStrictEqual(openEditor(), {
                left: { uri: "hg:mod@.^", text: "original mod" },
                right: { uri: "file:mod", text: "mod in parent" },
            } as OpenEditor);

            await openOnly(env.parentResource("mod"), "hg.openParentChange");
            assert.deepStrictEqual(openEditor(), {
                left: { uri: "hg:mod@.^", text: "original mod" },
                right: { uri: "hg:mod@.", text: "mod in parent" },
            } as OpenEditor);
        });

        test("shows mod parent and wdir diff", async function () {
            await openOnly(env.parentResource("modInBoth"));
            assert.deepStrictEqual(openEditor(), {
                left: { uri: "hg:modInBoth@.^", text: "original modInBoth" },
                right: { uri: "file:modInBoth", text: "mod in wdir" },
            } as OpenEditor);

            await openOnly(
                env.parentResource("modInBoth"),
                "hg.openParentChange"
            );
            assert.deepStrictEqual(openEditor(), {
                left: { uri: "hg:modInBoth@.^", text: "original modInBoth" },
                right: { uri: "hg:modInBoth@.", text: "mod in parent" },
            } as OpenEditor);
        });

        test("shows ren parent diff", async function () {
            await openOnly(env.parentResource("ren"));
            assert.deepStrictEqual(openEditor(), {
                left: { uri: "hg:toBeRen@.^", text: "original toBeRen" },
                right: { uri: "file:ren", text: "ren in parent" },
            } as OpenEditor);

            await openOnly(env.parentResource("ren"), "hg.openParentChange");
            assert.deepStrictEqual(openEditor(), {
                left: { uri: "hg:toBeRen@.^", text: "original toBeRen" },
                right: { uri: "hg:ren@.", text: "ren in parent" },
            } as OpenEditor);
        });

        test("shows ren parent and wdir diff", async function () {
            // We currently don't handle parent + wdir rens correctly.
            // The diff from parent to wdir fails to open. So we don't test it here.

            await openOnly(
                env.parentResource("renInParent"),
                "hg.openParentChange"
            );
            assert.deepStrictEqual(openEditor(), {
                left: {
                    uri: "hg:toBeRenInBoth@.^",
                    text: "original toBeRenInBoth",
                },
                right: { uri: "hg:renInParent@.", text: "ren in parent" },
            } as OpenEditor);
        });

        test("shows del parent diff", async function () {
            await openOnly(env.parentResource("del"));
            assert.deepStrictEqual(openEditor(), {
                only: { uri: "hg:del@.^", text: "original del" },
            } as OpenEditor);

            await openOnly(env.parentResource("del"), "hg.openParentChange");
            assert.deepStrictEqual(openEditor(), {
                only: { uri: "hg:del@.^", text: "original del" },
            } as OpenEditor);
        });
    });
});
