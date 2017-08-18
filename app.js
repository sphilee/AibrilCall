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
    you: {},
    our: {}
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
    let combinedText = "";
    for (let i in books) {
      if (books[i].time <= parseInt(req.params.time) + 1 && books[i].time >= parseInt(req.params.time) - 1) {
        if (books[i].number == req.params.number)
          results.me = JSON.parse(books[i].analyzed);
        else
          results.you = JSON.parse(books[i].analyzed);

        combinedText += books[i].translation;
      }
    }
    nlu.analyze(param(combinedText), (err, nlu) => {
      if (!err) {
        let target = { "keywords": [] };
        let keyBool = false;

        for (let i in nlu.keywords) {
          translateClient.translate(nlu.keywords[i].text, 'ko')
            .then((resultsTranslate) => {
              const translationKey = resultsTranslate[0];
              target.keywords.push({
                "text": translationKey,
                "relevance": nlu.keywords[i].relevance,
                "frequency": getIndicesOf(nlu.keywords[i].text, combinedText, false).length
              });
              if (target.keywords.length == nlu.keywords.length) {
                let byRelevance = target.keywords.slice(0);
                byRelevance.sort(function (a, b) {
                  return b.relevance - a.relevance;
                });
                target.keywords = byRelevance;
                keyBool = true;
              }
              if (keyBool) {
                results.our = JSON.parse(target);
              }
            });
        }

      } else {
        console.log("ERROR:" + err);
      }
    });
    res.json(results);
  });

});

app.post('/analyze', function (req, res) {
  console.log(req.body);
  let target = {};
  translateClient.translate(req.body.data, 'en')
    .then((results) => {
      const translation = results[0];
      nlu.analyze(param(translation), (err, results) => {
        if (!err) {
          target["emotion"] = results.emotion.document.emotion;
          target["sentiment"] = results.sentiment.document;

          let book = new Book();
          book.number = req.body.number;
          book.data = req.body.data;
          book.translation = translation;
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