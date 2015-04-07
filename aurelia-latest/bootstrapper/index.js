import core from 'core-js';
import {Aurelia, LogManager} from 'aurelia-framework';
import {ConsoleAppender} from 'aurelia-logging-console';

var logger = LogManager.getLogger('bootstrapper');

var readyQueue = [];
var isReady = false;

function onReady(callback) {
  return new Promise((resolve, reject) => {
    if (!isReady) {
      readyQueue.push(() => {
        try {
          resolve(callback());
        } catch(e) {
          reject(e);
        }
      });
    } else {
      resolve(callback());
    }
  });
}

export function bootstrap(configure) {
  return onReady(() => {
    var loader = new window.AureliaLoader(),
        aurelia = new Aurelia(loader);

    return configureAurelia(aurelia).then(() => { return configure(aurelia); });
  });
}

function ready(global) {
  return new Promise((resolve, reject) =>{
    if (global.document.readyState === "complete" ) {
      resolve(global.document);
    } else {
      global.document.addEventListener("DOMContentLoaded", completed, false);
      global.addEventListener("load", completed, false);
    }

    function completed() {
      global.document.removeEventListener("DOMContentLoaded", completed, false);
      global.removeEventListener("load", completed, false);
      resolve(global.document);
    }
  });
}

function ensureLoader(){
  if(!window.AureliaLoader){
    return System.normalize('aurelia-bootstrapper').then(function(bootstrapperName){
      return System.normalize('aurelia-loader-default', bootstrapperName).then(function(loaderName){
        return System.import(loaderName);
      })
    });
  }

  return Promise.resolve();
}

function preparePlatform(){
  return System.normalize('aurelia-bootstrapper').then(function(bootstrapperName){
    return System.normalize('aurelia-framework', bootstrapperName).then(function(frameworkName){
      System.map['aurelia-framework'] = frameworkName;

      return System.normalize('aurelia-loader', frameworkName).then(function(loaderName){
        var toLoad = [];

        if(!System.polyfilled){
          logger.debug('loading core-js');
          toLoad.push(System.normalize('core-js', loaderName).then(function(name){
            return System.import(name);
          }));
        }

        toLoad.push(System.normalize('aurelia-depedency-injection', frameworkName).then(function(name){
          System.map['aurelia-depedency-injection'] = name;
        }));

        toLoad.push(System.normalize('aurelia-router', bootstrapperName).then(function(name){
          System.map['aurelia-router'] = name;
        }));

        toLoad.push(System.normalize('aurelia-logging-console', bootstrapperName).then(function(name){
          System.map['aurelia-logging-console'] = name;
        }));

        if(!('import' in document.createElement('link'))){
          logger.debug('loading the HTMLImports polyfill');
          toLoad.push(System.normalize('webcomponentsjs/HTMLImports.min', loaderName).then(function(name){
            return System.import(name);
          }));
        }

        if(!("content" in document.createElement("template"))){
          logger.debug('loading the HTMLTemplateElement polyfill');
          toLoad.push(System.normalize('aurelia-html-template-element', loaderName).then(function(name){
            return System.import(name);
          }));
        }

        return Promise.all(toLoad);
      });
    });
  });
}

var installedDevelopmentLogging = false;

function configureAurelia(aurelia){
  return System.normalize('aurelia-bootstrapper').then(function(bName){
    var toLoad = [];

    toLoad.push(System.normalize('aurelia-templating-binding', bName).then(templatingBinding => {
      aurelia.use.defaultBindingLanguage = function(){
        aurelia.use.plugin(templatingBinding);
        return this;
      };
    }));

    toLoad.push(System.normalize('aurelia-history-browser', bName).then(historyBrowser => {
      return System.normalize('aurelia-templating-router', bName).then(templatingRouter => {
        aurelia.use.router = function(){
          aurelia.use.plugin(historyBrowser);
          aurelia.use.plugin(templatingRouter);
          return this;
        };
      });
    }));

    toLoad.push(System.normalize('aurelia-templating-resources', bName).then(name => {
      System.map['aurelia-templating-resources'] = name;
      aurelia.use.defaultResources = function(){
        aurelia.use.plugin(name);
        return this;
      }
    }));

    toLoad.push(System.normalize('aurelia-event-aggregator', bName).then(eventAggregator => {
      System.map['aurelia-event-aggregator'] = eventAggregator;
      aurelia.use.eventAggregator = function(){
        aurelia.use.plugin(eventAggregator);
        return this;
      };
    }));

    aurelia.use.standardConfiguration = function(){
      aurelia.use
        .defaultBindingLanguage()
        .defaultResources()
        .router()
        .eventAggregator();
      return this;
    };

    aurelia.use.developmentLogging = function(){
      if(!installedDevelopmentLogging){
        installedDevelopmentLogging = true;
        LogManager.addAppender(new ConsoleAppender());
        LogManager.setLevel(LogManager.levels.debug);
      }
      return this;
    }

    return Promise.all(toLoad);
  });
}

function runningLocally(){
  return window.location.protocol !== 'http' && window.location.protocol !== 'https';
}

function handleApp(appHost){
  var configModuleId = appHost.getAttribute('aurelia-app'),
      aurelia, loader;

  if(configModuleId){
    loader = new window.AureliaLoader();

    return loader.loadModule(configModuleId)
      .then(m => {
        aurelia = new Aurelia(loader);
        return configureAurelia(aurelia).then(() => { return m.configure(aurelia); });
      }).catch(e => {
        setTimeout(function(){ throw e; }, 0);
      });
  }else{
    aurelia = new Aurelia();

    return configureAurelia(aurelia).then(() => {
      if(runningLocally()){
        aurelia.use.developmentLogging();
      }

      aurelia.use.standardConfiguration();

      if(appHost.hasAttribute('es5')){
        aurelia.use.es5();
      } else if(appHost.hasAttribute('atscript')){
        aurelia.use.atscript();
      }

      return aurelia.start().then(a => { return a.setRoot(undefined, appHost); });
    }).catch(e => {
      setTimeout(function(){ throw e; }, 0);
    });
  }
}

function run() {
  return ready(window).then(doc => {
    var appHost = doc.querySelectorAll("[aurelia-app]");

    return ensureLoader().then(() => {
      return preparePlatform().then(function(){
        var i, ii;

        for (i = 0, ii = appHost.length; i < ii; ++i) {
          handleApp(appHost[i]);
        }

        isReady = true;
        for (i = 0, ii = readyQueue.length; i < ii; ++i) {
          readyQueue[i]();
        }
        readyQueue = [];
      });
    });
  });
}

run();
