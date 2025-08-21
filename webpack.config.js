const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    popup: './src/popup.ts',
    'ml-worker': './src/ml-worker.ts',
    'smart-assistant': './src/smart-assistant.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'node_modules/webextension-polyfill/dist/browser-polyfill.min.js', to: 'browser-polyfill.min.js' },
        { from: 'popup.html', to: 'popup.html' },
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons' } 
      ]
    })
  ],
  optimization: {
    minimize: false // Keep readable for debugging
  }
};