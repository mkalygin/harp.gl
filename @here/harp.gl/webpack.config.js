const fs = require("fs");
const webpack = require("webpack");
const HardSourceWebpackPlugin = require("hard-source-webpack-plugin");

const path = require("path");
const merge = require("webpack-merge");

const isProduction = process.env.NODE_ENV === "production";
const bundleSuffix = isProduction ? ".min" : "";

const commonConfig = {
    devtool: "source-map",
    resolve: {
        extensions: [".webpack.js", ".web.js", ".js"]
    },
    output: {
        path: path.join(process.cwd(), "dist")
    },
    plugins: [
        new webpack.EnvironmentPlugin({
            // default NODE_ENV to development. Override by setting the environment variable NODE_ENV to 'production'
            NODE_ENV: process.env.NODE_ENV || "development"
        }),
        new HardSourceWebpackPlugin()
    ],
    performance: {
        hints: false
    },
    mode: process.env.NODE_ENV || "development"
};

const mapComponentConfig = merge(commonConfig, {
    entry: path.resolve(__dirname, "./lib/index.js"),
    output: {
        filename: `harp${bundleSuffix}.js`,
        library: "harp"
    },
    externals: {
        three: "THREE"
    }
});

const mapComponentDecoderConfig = merge(commonConfig, {
    entry: path.resolve(__dirname, "./lib/DecoderBootstrap.js"),
    output: {
        filename: `harp-decoders${bundleSuffix}.js`
    },
    externals: {
        three: "THREE"
    }
});

module.exports = [mapComponentConfig, mapComponentDecoderConfig];
