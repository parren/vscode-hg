import * as path from "path";
import * as vscode from "vscode";
import { Resource } from "../../repository";
import { fromHgUri } from "../../uri";

export type LoadedDoc = { uri: string; text: string };
export type OpenSingle = { only: LoadedDoc };
export type OpenDiff = { left: LoadedDoc; right: LoadedDoc };
export type OpenEditor = OpenSingle | OpenDiff;

export async function openOnly(r: Resource, command?: string) {
    await vscode.commands.executeCommand("openEditors.closeAll");
    if (!command) {
        command = r.command.command;
    }
    await vscode.commands.executeCommand(command, ...r.command.arguments!);
}

export function openEditor(): OpenEditor {
    let ref = function (uri: vscode.Uri): string {
        if (!uri.query) return "";
        const { path, ref } = fromHgUri(uri);
        return ref ? `@${ref}` : "";
    };
    let docs = vscode.workspace.textDocuments
        .filter((d) => d.uri.scheme != "vscode-scm")
        .map((d) => {
            let p = `${d.uri.scheme}:${path.basename(d.uri.path)}`;
            let r = ref(d.uri);
            let t = d.getText();
            return { doc: { uri: `${p}${r}`, text: t }, vsdoc: d };
        });

    let windowDoc = vscode.window.activeTextEditor?.document;
    let main = docs.find((d) => d.vsdoc == windowDoc)!;
    let other = docs.find((d) => d != main);

    return other ? { left: other.doc, right: main.doc } : { only: main.doc };
}
