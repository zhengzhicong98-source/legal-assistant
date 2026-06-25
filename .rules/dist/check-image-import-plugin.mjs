// .rules/check-image-import-plugin.ts
import fs from "node:fs";
import path from "node:path";
import { ResolverFactory } from "oxc-resolver";
var IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;
var resolverInstance = null;
function getResolver(projectRoot) {
  if (!resolverInstance) {
    resolverInstance = new ResolverFactory({
      // 指定要解析的文件扩展名
      extensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"],
      // 条件导出名称（Conditional Exports）用于解析 npm 包中 package.json 的 exports 字段时使用的条件优先级
      conditionNames: ["import", "require", "node", "default"],
      // TypeScript 配置，用于解析路径别名
      tsconfig: {
        configFile: path.join(projectRoot, "tsconfig.json"),
        references: "auto"
      }
    });
  }
  return resolverInstance;
}
var checkImageImportRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Check if imported image files exist"
    },
    messages: {
      imageNotFound: "Image file '{{source}}' does not exist or cannot be resolved"
    },
    schema: []
  },
  create(context) {
    let projectRoot = path.dirname(context.filename);
    while (projectRoot !== path.dirname(projectRoot)) {
      if (fs.existsSync(path.join(projectRoot, "package.json"))) {
        break;
      }
      projectRoot = path.dirname(projectRoot);
    }
    const resolver = getResolver(projectRoot);
    const currentDir = path.dirname(context.filename);
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== "string" || !IMAGE_EXTENSIONS.test(source)) {
          return;
        }
        try {
          const resolved = resolver.sync(currentDir, source);
          if (!resolved.path || !fs.existsSync(resolved.path)) {
            context.report({
              node: node.source,
              messageId: "imageNotFound",
              data: {
                source
              }
            });
          }
        } catch {
          context.report({
            node: node.source,
            messageId: "imageNotFound",
            data: {
              source
            }
          });
        }
      }
    };
  }
};
var plugin = {
  meta: {
    name: "check-image-exists"
  },
  rules: {
    "no-missing-image": checkImageImportRule
  }
};
var check_image_import_plugin_default = plugin;
export {
  check_image_import_plugin_default as default
};
