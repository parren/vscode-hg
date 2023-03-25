/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ben Crowl. All rights reserved.
 *  Original Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import "mocha";
import { commands } from "vscode";
import { TestRepo } from "./testRepo";

// Defines a Mocha test suite to group tests of similar kind together
suite("hg", () => {
    let env: TestRepo;

    setup(async function () {
        env = await TestRepo.setup({});
    });

    test("status works", async function () {
        const repo = env.repo;
        env.write("text.txt");

        await commands.executeCommand("workbench.view.scm");
        await repo.status();
        assert.strictEqual(repo.stagingGroup.resources.length, 0);
        assert.strictEqual(repo.untrackedGroup.resources.length, 1);

        await commands.executeCommand("hg.addAll");
        await repo.status();
        assert.strictEqual(repo.workingDirectoryGroup.resources.length, 1);
        assert.strictEqual(repo.untrackedGroup.resources.length, 0);
    });
});
