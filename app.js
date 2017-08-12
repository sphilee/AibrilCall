/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const fs = require('fs');
const express = require('express');
const app = express();
const NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js');
const key = JSON.parse(fs.readFileSync('./nlu.json', 'utf8'));
const nlu = new NaturalLanguageUnderstandingV1(key);
const Translate = require('@google-cloud/translate');
const translateClient = Translate({
  projectId: 'aerial-day-140310',
  keyFilename: './test.json'
});
const getIndicesOf = (searchStr, str, caseSensitive) => {
  var searchStrLen = searchStr.length;
  if (searchStrLen == 0) {
    return [];
  }
  var startIndex = 0,
    index, indices = [];
  if (!caseSensitive) {
    str = str.toLowerCase();
    searchStr = searchStr.toLowerCase();
  }
  while ((index = str.indexOf(searchStr, startIndex)) > -1) {
    indices.push(index);
    startIndex = index + searchStrLen;
  }
  return indices;
}
let target = {
  "keywords": [],
  "categories": []
};
const param = (text) => {
  let parameters = {
    features: {
      'keywords': {
        'emotion': true
      },
      'categories': {},
      'sentiment': {},
      'emotion': {}
    },
    text
  };
  return parameters;
};
// setup mongodb server
const mongoose = require('mongoose');
const db = mongoose.connection;
db.on('error', console.error);
db.once('open', function () {
  console.log("Connected to mongod server");
});
mongoose.connect('mongodb://localhost/mongodb_tutorial');
mongoose.Promise = global.Promise;
//define model
const Book = require('./models/book');
// setup body-parser
const bodyParser = require('body-parser');
app.use(bodyParser.json());
// Bootstrap application settings
require('./config/express')(app);

const router = require('./routes')(app, Book);

app.get('/', function (req, res) {
  res.render('index');
});
app.get('/users', function (req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.write(JSON.stringify(require('./users.json')));
  res.end();
});
app.post('/analyze', function (req, res) {
  req.body.timestamp = new Date();
  console.log(req.body);
  translateClient.translate(req.body.data, 'en')
    .then((results) => {
      const translation = results[0];
      let cateBool = false;
      let keyBool = false;
      nlu.analyze(param(translation), (err, results) => {
        if (!err) {
          target["emotion"] = results.emotion.document.emotion;
          target["sentiment"] = results.sentiment.document;

          for (let i in results.categories) {
            translateClient.translate(results.categories[i].label, 'ko')
              .then((resultsTranslate) => {
                const translationKey = resultsTranslate[0];

                target.categories.push({
                  "label": translationKey,
                  "score": results.categories[i].score
                });
                if (target.categories.length == results.categories.length) {
                  let byRelevance = target.categories.slice(0);
                  byRelevance.sort(function (a, b) {
                    return b.relevance - a.relevance;
                  });
                  target.categories = byRelevance;
                  cateBool = true;
                }
              })
              .catch((err) => {
                console.error('ERROR:', err);
              });
          }
          for (let i in results.keywords) {
            translateClient.translate(results.keywords[i].text, 'ko')
              .then((resultsTranslate) => {
                const translationKey = resultsTranslate[0];
                target.keywords.push({
                  "text": translationKey,
                  "relevance": results.keywords[i].relevance,
                  "emotion": JSON.stringify(results.keywords[i].emotion),
                  "frequency": getIndicesOf(results.keywords[i].text, translation, false).length
                });
                if (target.keywords.length == results.keywords.length) {
                  let byRelevance = target.keywords.slice(0);
                  byRelevance.sort(function (a, b) {
                    return b.relevance - a.relevance;
                  });
                  target.keywords = byRelevance;
                  keyBool = true;
                }
                if (keyBool) {
                  res.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8"
                  });
                  res.write(JSON.stringify(target));
                  res.end();
                  // console.log(target);
                  target = {
                    "keywords": [],
                    "categories": []
                  };
                }
              })
              .catch((err) => {
                console.error('ERROR:', err);
              });
          }
        } else {
          console.log("ERROR:" + err);
        }
      });


    })
    .catch((err) => {
      console.error('ERROR:', err);
    });
});
app.post('/api/analyze', function (req, res, next) {
  if (process.env.SHOW_DUMMY_DATA) {
    res.json(require('./payload.json'));
  } else {
    nlu.analyze(req.body, (err, results) => {
      if (err) {
        return next(err);
      } else {
        res.json({
          query: req.body.query,
          results
        });
      }
    });
  }
});

// error-handler settings
require('./config/error-handler')(app);

module.exports = app;