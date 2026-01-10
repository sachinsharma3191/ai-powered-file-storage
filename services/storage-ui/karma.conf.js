// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {
        // you can add configuration options for Jasmine here
        // the possible options are listed at https://jasmine.github.io/api/edge/Configuration.html
        // for example, you can disable the random execution order
        // random: false
      },
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true // removes the duplicated traces
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcov' },
        { type: 'clover' }
      ],
      thresholds: {
        global: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        },
        files: [
          {
            pattern: '**/*.ts',
            thresholds: {
              statements: 100,
              branches: 100,
              functions: 100,
              lines: 100
            }
          }
        ]
      },
      fixWebpackSourcePaths: true,
      includeAllSources: true,
      check: {
        global: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        },
        each: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        }
      }
    },
    angularCli: {
      environment: 'dev'
    },
    reporters: ['progress', 'kjhtml', 'coverage'],
    browsers: ['ChromeHeadless'],
    restartOnFileChange: true,
    singleRun: false,
    autoWatch: true,
    colors: true,
    logLevel: config.LOG_INFO,
    files: [
      { pattern: './src/test.ts', watched: false }
    ],
    preprocessors: {
      './src/test.ts': ['@angular-devkit/build-angular']
    },
    mime: {
      'text/x-typescript': ['ts', 'tsx']
    },
    webpack: {
      // Add webpack configuration for better source map support
      devtool: 'inline-source-map'
    },
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
      }
    }
  });
};
