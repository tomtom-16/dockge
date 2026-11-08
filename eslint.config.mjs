import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vue from "eslint-plugin-vue";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";

const files = [ "**/*.{ts,vue}" ];
// Preserve the repository's style rules using their maintained replacements.
const styleRules = {
    "yoda": "error",
    "linebreak-style": [
        "error",
        "unix"
    ],
    "camelcase": [
        "warn",
        {
            "properties": "never",
            "ignoreImports": true
        }
    ],
    "no-unused-vars": [
        "warn",
        {
            "args": "none"
        }
    ],
    "indent": [
        "error",
        4,
        {
            "ignoredNodes": [
                "TemplateLiteral"
            ],
            "SwitchCase": 1
        }
    ],
    "quotes": [
        "error",
        "double"
    ],
    "semi": "error",
    "vue/html-indent": [
        "error",
        4
    ],
    "vue/max-attributes-per-line": "off",
    "vue/singleline-html-element-content-newline": "off",
    "vue/html-self-closing": "off",
    "vue/require-component-is": "off",
    "vue/attribute-hyphenation": "off",
    "vue/multi-word-component-names": "off",
    "no-multi-spaces": [
        "error",
        {
            "ignoreEOLComments": true
        }
    ],
    "array-bracket-spacing": [
        "warn",
        "always",
        {
            "singleValue": true,
            "objectsInArrays": false,
            "arraysInArrays": false
        }
    ],
    "space-before-function-paren": [
        "error",
        {
            "anonymous": "always",
            "named": "never",
            "asyncArrow": "always"
        }
    ],
    "curly": "error",
    "object-curly-spacing": [
        "error",
        "always"
    ],
    "object-curly-newline": "off",
    "object-property-newline": "error",
    "comma-spacing": "error",
    "brace-style": "error",
    "no-var": "error",
    "key-spacing": "warn",
    "keyword-spacing": "warn",
    "space-infix-ops": "error",
    "arrow-spacing": "warn",
    "no-trailing-spaces": "error",
    "no-constant-condition": [
        "error",
        {
            "checkLoops": false
        }
    ],
    "space-before-blocks": "warn",
    "no-extra-boolean-cast": "off",
    "no-multiple-empty-lines": [
        "warn",
        {
            "max": 1,
            "maxBOF": 0
        }
    ],
    "lines-between-class-members": [
        "warn",
        "always",
        {
            "exceptAfterSingleLine": true
        }
    ],
    "no-unneeded-ternary": "error",
    "array-bracket-newline": [
        "error",
        "consistent"
    ],
    "eol-last": [
        "error",
        "always"
    ],
    "comma-dangle": [
        "warn",
        "only-multiline"
    ],
    "no-empty": [
        "error",
        {
            "allowEmptyCatch": true
        }
    ],
    "no-control-regex": "off",
    "one-var": [
        "error",
        "never"
    ],
    "max-statements-per-line": [
        "error",
        {
            "max": 1
        }
    ],
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-unused-vars": [
        "warn",
        {
            "args": "none"
        }
    ],
    "prefer-const": "off"
};
// The old core key-spacing rule did not format TypeScript type annotations.
styleRules["key-spacing"] = [ "warn", {
    ignoredNodes: [ "TSTypeLiteral", "TSInterfaceBody", "ClassBody" ],
} ];
const rules = Object.fromEntries(Object.entries(styleRules).map(([ name, value ]) => [
    Object.hasOwn(stylistic.rules, name) ? `@stylistic/${name}` : name, value,
]));

export default [
    { ignores: [ "node_modules/**", "frontend-dist/**", "data/**", "stacks/**", "tmp/**", "private/**" ] },
    { ...js.configs.recommended, files },
    ...tsPlugin.configs["flat/recommended"].map(config => ({ ...config, files })),
    ...vue.configs["flat/recommended"].map(config => ({ ...config, files: [ "**/*.vue" ] })),
    {
        files,
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
            parserOptions: { parser: tsParser, extraFileExtensions: [ ".vue" ] },
        },
        plugins: { "@stylistic": stylistic, vue },
        rules,
    },
];
