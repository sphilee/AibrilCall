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
const param = (text) => {
  let parameters = {
    features: {
      'keywords': {},
      'categories': {},
      'sentiment': {},
      'emotion': {}
    },
    text
  };
  return parameters;
};
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

app.get('/users', function (req, res) {
  res.json(require('./users.json'));
});
app.get('/phone/:number/:opponentNumber/:time', function (req, res) {
  let results = {
    me: {},
    you: {}
  };
  Book.find({
    'number': {
      $in: [
        req.params.number,
        req.params.opponentNumber,
      ]
    }
  }, function (err, books) {
    if (err) return res.status(500).json({
      error: err
    });
    if (books.length === 0) return res.status(404).json({
      error: 'data not found'
    });
    for (let i in books) {
	    if(books[i].time <= parseInt(req.params.time)+1 && books[i].time >= parseInt(req.params.time)-1){
      if (books[i].number == req.params.number)
        results.me = JSON.parse(books[i].analyzed);
      else
        results.you = JSON.parse(books[i].analyzed);
	    }
    }
    res.json(results);
  });

});

app.post('/analyze', function (req, res) {
  console.log(req.body);
  let target = {
    "keywords": [],
    "categories": []
  };
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
                  "emotion": results.keywords[i].emotion,
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
                  let book = new Book();
                  book.number = req.body.number;
                  book.name = req.body.name;
                  book.data = req.body.data;
                  book.opponentNumber = req.body.opponentNumber;
                  book.time = req.body.time;
                  book.analyzed = JSON.stringify(target);

                  book.save(function (err) {
                    if (err) {
                      res.writeHead(404);
                      res.end(JSON.stringify(err));
                      return;
                    }

                    res.writeHead(200);
                    res.end("success");

                  });
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
// app.get('/', function (req, res) {
//   res.render('index');
// });
// app.post('/api/analyze', function (req, res, next) {
//   if (process.env.SHOW_DUMMY_DATA) {
//     res.json(require('./payload.json'));
//   } else {
//     nlu.analyze(req.body, (err, results) => {
//       if (err) {
//         return next(err);
//       } else {
//         res.json({
//           query: req.body.query,
//           results
//         });
//       }
//     });
//   }
// });

// error-handler settings
require('./config/error-handler')(app);

module.exports = app;
