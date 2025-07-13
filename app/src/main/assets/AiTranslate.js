(function () {
    'use strict';
      if (window.__myInjectedScriptHasRun__) return;
      window.__myInjectedScriptHasRun__ = true;
    console.log("loaded from js 1")

     console.log("Injected script is running once!", Date.now(), AndroidApp.translateWithId());


}());
 function onTranslationResult(result){
    console.log("loaded from js 4 final result onTranslationResult"+result)

 }