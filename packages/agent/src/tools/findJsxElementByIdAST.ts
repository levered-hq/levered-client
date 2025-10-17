import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export function findJsxElementByIdAST(
  fileContent: string,
  elementId: string
): { code: string; start: number; end: number } | null {
  const ast = parse(fileContent, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  let result: { code: string; start: number; end: number } | null = null;

  traverse(ast, {
    JSXOpeningElement(path) {
      const idAttribute = path.node.attributes.find(
        (attr): attr is t.JSXAttribute =>
          t.isJSXAttribute(attr) && attr.name.name === "data-levered-id"
      );

      if (
        idAttribute &&
        t.isStringLiteral(idAttribute.value) &&
        idAttribute.value.value === elementId
      ) {
        const parentElement = path.findParent((p) =>
          p.isJSXElement()
        ) as NodePath<t.JSXElement> | null;

        if (
          parentElement &&
          parentElement.node.start &&
          parentElement.node.end
        ) {
          result = {
            code: fileContent.slice(
              parentElement.node.start,
              parentElement.node.end
            ),
            start: parentElement.node.start,
            end: parentElement.node.end,
          };
          path.stop();
        }
      }
    },
  });

  return result;
}
