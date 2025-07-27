const resolvers = new Map();

(async function () {
    'use strict';
      if (window.image__myInjectedScriptHasRun__) return;
      window.image__myInjectedScriptHasRun__ = true;
    console.log("loaded from js 1")

    console.time("loaded from js");
        AndroidApp.extractTextFromImage("https://acropolis-wp-content-uploads.s3.us-west-1.amazonaws.com/02-women-leveling-up-in-STEM.png","454545")
       const result =  await waitForTranslation("454545")
       console.log("loaded from js 7🚀 ~ result: ", result)
       console.timeEnd("loaded from js");
}());

function waitForTranslation(id) {
    return new Promise((resolve) => {
        resolvers.set(id, resolve);
    });
}


 function onExtractionResult(result, id){
    console.log("loaded from js 4 final result onExtractionResult"+result)
    resolvers.get(id)?.(JSON.stringify(result));

 }