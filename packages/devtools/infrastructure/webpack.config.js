const slsw = require('serverless-webpack');
const webpack = require('webpack');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');


module.exports = {
    devtool: 'source-map',
    entry: slsw.lib.entries,
    mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
    target: 'node',
    externals: ['mongoose', 'express', 'node-fetch'],
    plugins: [
        // This defines the window global (with value of `undefined`).
        new webpack.ProvidePlugin({
            window: path.resolve(path.join(__dirname, 'src/utils/webpackFakeWindow')),
        }),
    ]

};
