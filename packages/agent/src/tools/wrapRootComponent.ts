import fs from "fs/promises";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

interface LeveredConfig {
  publicKey: string;
  apiEndpoint: string;
}

export const wrapRootComponent = async (
  filePath: string,
  config: LeveredConfig
): Promise<void> => {
  const content = await fs.readFile(filePath, "utf-8");
  const ast = parse(content, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  let wrapped = false;

  traverse(ast, {
    JSXElement(path) {
      if (wrapped) return;

      const openingElement = path.node.openingElement;
      if (
        t.isJSXIdentifier(openingElement.name) &&
        openingElement.name.name.toLowerCase() === "body"
      ) {
        const originalChildren = path.node.children;

        const publicKeyAttr = t.jsxAttribute(
          t.jsxIdentifier("publicKey"),
          t.stringLiteral(config.publicKey)
        );
        const apiEndpointAttr = t.jsxAttribute(
          t.jsxIdentifier("apiEndpoint"),
          t.stringLiteral(config.apiEndpoint)
        );

        const providerElement = t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier("LeveredProvider"), [
            publicKeyAttr,
            apiEndpointAttr,
          ]),
          t.jsxClosingElement(t.jsxIdentifier("LeveredProvider")),
          originalChildren,
          false
        );

        path.node.children = [
          t.jsxText("\n"),
          providerElement,
          t.jsxText("\n"),
        ];
        wrapped = true;
        path.stop();
      }
    },
  });

  if (!wrapped) {
    throw new Error(
      "Could not find a <body> element to wrap in the root layout file."
    );
  }

  traverse(ast, {
    Program: {
      exit(path) {
        const hasImport = path.node.body.some(
          (node) =>
            t.isImportDeclaration(node) &&
            node.source.value === "@levered/client"
        );
        if (hasImport) return;

        const importDecl = t.importDeclaration(
          [
            t.importSpecifier(
              t.identifier("LeveredProvider"),
              t.identifier("LeveredProvider")
            ),
          ],
          t.stringLiteral("@levered/client")
        );

        const useClientIndex = path.node.body.findIndex(
          (node) =>
            t.isExpressionStatement(node) &&
            t.isStringLiteral(node.expression) &&
            node.expression.value === "use client"
        );

        path.node.body.splice(useClientIndex + 1, 0, importDecl);
      },
    },
  });

  const { code } = generate(ast, { retainLines: true });
  await fs.writeFile(filePath, code);
};
