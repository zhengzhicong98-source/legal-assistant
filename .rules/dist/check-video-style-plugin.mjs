// .rules/check-video-style-plugin.ts
var checkVideoStyleRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow inline style prop on <video> elements in weapp"
    },
    messages: {
      noVideoInlineStyle: "Do not use inline `style` on <video> \u2014 weapp renders the native video as an overlay that ignores ALL inline styles on the video element AND ignores `maxHeight`/`overflow` on its parent container. Moving the style to the parent div does NOT fix this. Correct fix: wrap the video in a container with explicit `height` (not `maxHeight`) and use `className=\"w-full h-full\"` on the video itself \u2014 e.g. `<div style={{height: '56vw'}}><video className=\"w-full h-full\" controls src={url} /></div>`. Use `height: '{ratio}vw'` where ratio = 100 \xD7 (video height / video width), e.g. 56vw for 16:9 landscape, 178vw for 9:16 portrait."
    },
    schema: []
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const jsxNode = node;
        if (jsxNode.name?.type !== "JSXIdentifier" || jsxNode.name?.name !== "video") {
          return;
        }
        for (const attr of jsxNode.attributes ?? []) {
          if (attr.type === "JSXAttribute" && attr.name?.type === "JSXIdentifier" && attr.name?.name === "style") {
            context.report({
              node: attr,
              messageId: "noVideoInlineStyle"
            });
          }
        }
      }
    };
  }
};
var plugin = {
  meta: {
    name: "check-video-style"
  },
  rules: {
    "no-video-inline-style": checkVideoStyleRule
  }
};
var check_video_style_plugin_default = plugin;
export {
  check_video_style_plugin_default as default
};
