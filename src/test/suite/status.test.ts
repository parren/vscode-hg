/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ben Crowl. All rights reserved.
 *  Original Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import * as fs from "fs";
import "mocha";
import * as path from "path";
import { commands } from "vscode";
import { setupTestRepo, teardownTestRepo, TestRepo } from "./testRepo";

// Defines a Mocha test suite to group tests of similar kind together
suite("hg", () => {
    let testRepo: TestRepo;

    setup(async function () {
        testRepo = await setupTestRepo();
    });

    teardown(async function () {
        await teardownTestRepo(testRepo);
    });

    function file(relativePath: string) {
        return path.join(testRepo.dir, relativePath);
    }

    test("status works", async function () {
        const repository = testRepo.repo;
        fs.writeFileSync(file("text.txt"), "test", "utf8");

        await commands.executeCommand("workbench.view.scm");
        await repository.status();
        assert.equal(0, repository.stagingGroup.resources.length);
        assert.equal(1, repository.untrackedGroup.resources.length);

        await commands.executeCommand("hg.addAll");
        await repository.status();
        assert.equal(1, repository.workingDirectoryGroup.resources.length);
        assert.equal(0, repository.untrackedGroup.resources.length);
    });
});
