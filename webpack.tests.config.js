const webpack = require("webpack");
const glob = require("glob");
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HardSourceWebpackPlugin = require("hard-source-webpack-plugin");

const testResourceDirs = glob.sync(path.join(__dirname, "@here/*/test/resources"));
const testResources = testResourceDirs.map(dir => {
    return {
        from: dir,
        to: path.relative(__dirname, dir)
    };
});

const harpFontResourcesPath = path.dirname(
    require.resolve("@here/harp-font-resources/package.json")
);

const browserTestsConfig = {
    devtool: "source-map",
    resolve: {
        extensions: [".web.js", ".js"],
        modules: [".", "node_modules"]
    },
    entry: {
        test: glob.sync("@here/*/test/**/*.js").filter(path => !path.includes("generator-harp.gl"))
    },
    output: {
        path: path.join(__dirname, "dist/test"),
        filename: "[name].bundle.js"
    },
    plugins: [
        new HardSourceWebpackPlugin(),
        new webpack.EnvironmentPlugin({
            // default NODE_ENV to development. Override by setting the environment variable NODE_ENV to 'production'
            NODE_ENV: process.env.NODE_ENV || "development"
        }),
        new CopyWebpackPlugin([
            path.join(__dirname, "test/index.html"),
            require.resolve("three/build/three.min.js"),
            require.resolve("mocha/mocha.js"),
            require.resolve("mocha/mocha.css"),
            require.resolve("mocha-webdriver-runner/dist/mocha-webdriver-client.js"),
            ...testResources,
            {
                from: path.join(harpFontResourcesPath, "resources"),
                to: "@here/harp-font-resources/resources"
            }
        ])
    ],
    externals: {
        fs: "undefined",
        three: "THREE",
        typestring: "undefined"
    },
    performance: {
        hints: false
    },
    stats: {
        all: false,
        timings: true,
        exclude: "/resources/",
        errors: true,
        entrypoints: true,
        warnings: true
    },
    watchOptions: {
        aggregateTimeout: 300,
        poll: 1000
    },
    mode: process.env.NODE_ENV || "development"
};

module.exports = browserTestsConfig;
