// .rules/taro-app-config-validator.ts
import fs from "node:fs";
import path from "node:path";
var taroAppConfigValidatorRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure 'pages' array items exist as .tsx files, and 'tabBar.list' contains 2-5 items for WeChat mini-program compatibility"
    },
    messages: {
      tooFewListItems: "WeChat mini-program requires at least 2 tab items. Current tabBar.list has {{count}} item(s). Please add more tabs or remove the tabBar configuration.",
      tooManyListItems: "WeChat mini-program cannot publish with more than 5 tabs. Current tabBar.list has {{count}} items. Please reduce the number of tabs to 5 or fewer.",
      pageFileNotFound: "Page file 'src/{{pagePath}}.tsx' does not exist. Please either create the file or remove '{{pagePath}}' from the pages array in app.config.ts."
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
    function checkPageFileExists(pagePath) {
      const fullPath = path.join(projectRoot, "src", `${pagePath}.tsx`);
      return fs.existsSync(fullPath);
    }
    function isPropertyNode(node) {
      return node.type === "Property";
    }
    function checkPagesArray(elements) {
      elements.forEach((element) => {
        if (element && element.type === "Literal" && typeof element.value === "string") {
          const pagePath = element.value;
          if (!checkPageFileExists(pagePath)) {
            context.report({
              node: element,
              messageId: "pageFileNotFound",
              data: { pagePath }
            });
          }
        }
      });
    }
    return {
      /**
       * 匹配 `const pages = [...]` 形式的变量声明
       */
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && node.id.name === "pages" && node.init && node.init.type === "ArrayExpression") {
          checkPagesArray(node.init.elements);
        }
      },
      /**
       * 匹配 `defineAppConfig({ pages: [...] })` 或任意对象字面量中 `pages: [...]` 属性
       */
      "Property[key.name='pages'][value.type='ArrayExpression']"(node) {
        checkPagesArray(node.value.elements);
      },
      /**
       * 访问所有对象属性节点，检查 tabBar.list 数组
       * tabBar: {           <- grandParent (Property)
       *   list: [           <- node (Property)
       *     {...},          <- 数组元素
       *     {...}
       *   ]
       * }
       */
      Property(node) {
        if (node.key.type === "Identifier" && node.key.name === "list" && node.value.type === "ArrayExpression") {
          const parent = node.parent;
          if (parent.type === "ObjectExpression") {
            const grandParent = parent.parent;
            if (isPropertyNode(grandParent) && grandParent.key.type === "Identifier" && grandParent.key.name === "tabBar") {
              const arrayLength = node.value.elements.length;
              if (arrayLength < 2) {
                context.report({
                  node: node.value,
                  messageId: "tooFewListItems",
                  data: {
                    count: arrayLength + ""
                  }
                });
              }
              if (arrayLength > 5) {
                context.report({
                  node: node.value,
                  messageId: "tooManyListItems",
                  data: {
                    count: arrayLength + ""
                  }
                });
              }
            }
          }
        }
      }
    };
  }
};
var plugin = {
  meta: {
    name: "taro-app-config-validator"
  },
  rules: {
    "taro-app-config-validator": taroAppConfigValidatorRule
  }
};
var taro_app_config_validator_default = plugin;
export {
  taro_app_config_validator_default as default
};
