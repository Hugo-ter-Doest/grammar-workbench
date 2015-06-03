/*
    Grammar Workbench: development environment for unification grammars
    Copyright (C) 2015 Hugo W.L. ter Doest

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var server_settings = require('./config/Settings');

var log4js = require('log4js');
log4js.configure(server_settings.log4js_config);
var logger = log4js.getLogger('grammar-workbench');

var fs = require('fs');
var path = require('path');

var express = require('express');
var app = express();
var server = require('http').Server(app);

var bodyParser = require('body-parser');
var formidable = require('formidable');

// Chart parser factory
var chartParsers = require('../chart-parsers');
var typeLatticeParser = chartParsers.TypeLatticeParser;
var lexiconParser = chartParsers.LexiconParser;
var grammarParser = chartParsers.GrammarParser;
var parserFactory = new chartParsers.ParserFactory();
var featureStructureFactory = new chartParsers.FeatureStructureFactory();

var natural = require('natural');

var simplePOSTagger = require('../simple-pos-tagger/lib/SimplePOSTagger');
var functionWordsBase = '/home/hugo/Workspace/simple-pos-tagger/';
var functionWordsConfigFile = functionWordsBase + "data/English/lexicon_files.json";

var settings = {};

var TYPE_LATTICE_FILE = 0;
var LEXICON_FILE = 1;
var GRAMMAR_FILE = 2;

function initialise() {
  // Tokenizer settings
  settings.tokenizerAlgorithm = '';
  settings.regularExpression = '';

  // Type lattice settings
  settings.typeLatticeFile = '';
  settings.typeLattice = null;
  settings.applyAppropriateFunction = true;
  settings.typeLatticeHasAppropriateFunction = false;

  // Tagger settings
  settings.taggingAlgorithm = '';
  settings.lexiconFile = '';
  settings.stripWordsNotInLexicon = false;
  settings.assignFunctionWordTags = false;
  settings.tagger = null;
  settings.lexiconHasFeatureStructures = false;

  // Parser settings
  settings.parsingAlgorithm = '';
  settings.grammarInInCNF = false;
  settings.grammarFile = '';
  settings.grammar = null;
  settings.grammarHasUnificationConstraints = false;
}

function homeView(req, res) {

}

// Page for loading a grammar
function settingsView(req, res) {
  res.render('edit_settings', {settings: settings});
}

function submitSettings(req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function(err, fields, files) {
    logger.debug('submitSettings: fields: ' + JSON.stringify(fields, null, 2));
    logger.debug('submitSettings: files: ' + JSON.stringify(files, null, 2));
    switch(fields.submit_settings) {
      case 'Edit type lattice':
        if (files.typeLatticeFile) {
          settings.typeLatticeFile = files.typeLatticeFile.name;
          fs.readFile(files.typeLatticeFile.path, 'utf8', function (error, text) {
            settings.typeLatticeText = text;
            settings.typeLattice = null;
            editTypeLattice(req, res);
          });
        }
        break;
      case 'Edit lexicon':
        if (files.lexiconFile) {
          settings.lexiconFile = files.lexiconFile.name;
          fs.readFile(files.lexiconFile.path, 'utf8', function (error, text) {
            settings.lexiconText = text;
            settings.lexicon = null;
            editLexicon(req, res);
          });
        }
        break;
      case 'Edit grammar':
        if (files.grammarFile) {
          settings.grammarFile = files.grammarFile.name;
          fs.readFile(files.grammarFile.path, 'utf8', function (error, text) {
            settings.grammarText = text;
            // Invalidate the grammar
            settings.grammar = null;
            editGrammar(req, res);
          });
        }
        break;
      case 'Save':
        // Process tokenizer settings
        settings.tokenizerAlgorithm = fields.tokenizerAlgorithm;
        settings.regularExpression = fields.regularExpression;
        switch(settings.tokenizerAlgorithm) {
          case "wordTokenizer":
            settings.tokenizer = new natural.WordTokenizer();
            break;
          case "treebankWordTokenizer":
            settings.tokenizer = new natural.TreebankWordTokenizer();
            break;
          case "regexpTokenizer":
            settings.tokenizer = new natural.RegexpTokenizer(settings.regularExpression);
            break;
          case "wordPunctTokenizer":
            settings.tokenizer = new natural.WordPunctTokenizer();
            break;
          default:
            settings.tokenizer = new natural.WordTokenizer();
            settings.tokenizerAlgorithm = "wordTokenizer";
        }
        
        // Process type lattice settings
        settings.applyAppropriateFunction = (fields.applyAppropriateFunction === 'on');
        if (files.typeLatticeFile.name) {
          settings.typeLatticeFile = files.typeLatticeFile.name;
          settings.typeLatticeText = fs.readFileSync(files.typeLatticeFile.path, 'utf8');
          settings.typeLattice = typeLatticeParser.parse(settings.typeLatticeText);
          logger.debug("submitSettings: created a new type lattice");
          settings.typeLatticeHasAppropriateFunction = 
            (settings.typeLattice.appropriate_function !== null);
        }

        // Process tagger settings
        settings.taggingAlgorithm = fields.taggingAlgorithm;
        settings.stripWordsNotInLexicon = (fields.stripWordsNotInLexicon === 'on');
        settings.assignFunctionWordTags = (fields.assignFunctionWordTags === 'on');
        if (files.lexiconFile.name) {
          settings.lexiconFile = files.lexiconFile.name;
          settings.lexiconText = fs.readFileSync(files.lexiconFile.path, 'utf8');
          switch (settings.taggingAlgorithm) {
            case "fsPOSTagger":
              if (settings.typeLattice) {
                settings.tagger = lexiconParser.parse(settings.lexiconText, 
                  {type_lattice: settings.typeLattice});
                GLOBAL.config.LIST_OF_CATEGORIES = false;
                settings.lexiconHasFeatureStructures = true;
              }
              break;
            case "simplePOSTagger":
              // Assigns a list of lexical categories
              settings.tagger = new simplePOSTagger(files.lexiconFile.path, false);
              logger.debug("submitSettings: created a Simple POS Tagger");
              GLOBAL.config.LIST_OF_CATEGORIES = true;
              logger.debug("submitSettings: GLOBAL.config.LIST_OF_CATEGORIES: " + GLOBAL.config.LIST_OF_CATEGORIES);
              break;
            case "brillPOSTagger":
              // Assigns a list of lexical categories based on Brill's transformation rules
              GLOBAL.config.LIST_OF_CATEGORIES = true;
              break;
            case "Wordnet":
              settings.tagger = tagSentenceWithWordnet;
              GLOBAL.config.LIST_OF_CATEGORIES = true;
              break;
            default:
              settings.tagger = lexiconParser.parse(settings.lexiconText,
                {type_lattice: settings.typeLattice});
              GLOBAL.config.LIST_OF_CATEGORIES = false;
              settings.tagger = lexicon;
          }
        }

        // Process parser settings
        settings.applyUnification = (fields.applyUnification === 'on');
        settings.parsingAlgorithm = fields.parsingAlgorithm;
        if (files.grammarFile.name) {
          settings.grammarFile = files.grammarFile.name;
          settings.grammarText = fs.readFileSync(files.grammarFile.path, 'utf8');
          if (settings.typeLattice) {
            settings.grammar = grammarParser.parse(settings.grammarText, 
              {type_lattice: settings.typeLattice});
            logger.debug("submitSettings: created a new grammar");
            settings.grammarHasUnificationConstraints = settings.grammar.hasUnificationConstraints;
            settings.grammarIsInCNF = settings.grammar.is_CNF;
            logger.debug("submitSettings: grammar is in CNF: " + settings.grammarIsInCNF);
          }
        }
      default: 
        // Cancel
    }
    res.redirect('input_sentence');
  });
}

function editTypeLatticeView(req, res) {
  res.render('edit_file', {settings: settings, fileToEdit: TYPE_LATTICE_FILE});
}

function editLexiconView(req, res) {
  res.render('edit_file', {settings: settings, fileToEdit: LEXICON_FILE});
}

function editGrammarView(req, res) {
  res.render('edit_file', {settings: settings, fileToEdit: GRAMMAR_FILE});
}

function saveFile(req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function(err, fields, files) {
    logger.debug('saveFile: fields: ' + JSON.stringify(fields, null, 2));
    logger.debug('saveFile: files: ' + JSON.stringify(files, null, 2));
    switch(fields.save_file) {
      case 'Save':
        // Set the file server side, add to a library?
        break;
      case 'Cancel':
        res.redirect('edit_settings');
        break
      default:
    }   
  });
}

function tokenizerView(req, res) {
  res.render('tokenizer');
}

function tokenizeSentenceView(req, res) {

}

function taggerView(req, res) {
  res.render('tagger');
}

function tagSentenceView(req, res) {

}

// Page for entering a sentence
function parserView(req, res) {
  res.render('parser_input', {settings: settings});
}

// Tag the sentence using Wordnet
// Wordnet 'knows' only a limited set of lexical categories:
// n    NOUN
// v    VERB
// a    ADJECTIVE
// s    ADJECTIVE SATELLITE
// r    ADVERB 
// If a word is not found in wordnet POS 'unknown' is assigned
function tagSentenceWithWordnet(taggedSentence, callback) {
  var wordnet = new natural.WordNet();
  var nrTokens = taggedSentence.length;

  taggedSentence.forEach(function(taggedWord) {
    logger.debug("tagSentenceWithWordnet: processing " + taggedWord);
    wordnet.lookup(taggedWord[0], function(results) {
      results.forEach(function(result) {
        if (taggedWord.lastIndexOf(result.pos) <= 0) {
          taggedWord.push(result.pos);
          logger.debug("Lexical category of " + taggedWord[0] + " is: " + result.pos);
        }
      });

      nrTokens--;
      if (nrTokens === 0) {
        logger.info("Exit tagSentenceWithWordnet: " + JSON.stringify(taggedSentence));
        callback(taggedSentence);
      }
    });
  });
}

// Adds function word tags to the already assigned tags
function tagFunctionWords(results) {
  var taggedSentence = results.taggedSentence;
  
  logger.debug("Enter tagFunctionWords( " + taggedSentence + ")");
  tagger = new simplePOSTagger(functionWordsConfigFile);
  taggedSentence.forEach(function(taggedWord) {
    var functionWordTags = tagger.tag_word(taggedWord[0]);
    logger.debug("tagFunctionWords: function word tags: " + functionWordTags);
    if (functionWordTags) {
      functionWordTags.forEach(function(functionWordTag) {
        if (GLOBAL.config.LIST_OF_CATEGORIES) {
          taggedWord.push(functionWordTag);
        }
        else {
          var new_fs = featureStructureFactory.createFeatureStructure({
            type_lattice: settings.typeLattice
          });
          var functionWordType = settings.typeLattice.get_type_by_name(functionWordTag);
          var empty_fs = featureStructureFactory.createFeatureStructure({
            type_lattice: settings.typeLattice, 
            type: functionWordType
          });
          new_fs.add_feature('category', empty_fs, settings.typeLattice);
          taggedWord.push(new_fs);
        }
      });
    }
  });
  logger.debug("Exit tagFunctionWords: " + JSON.stringify(taggedSentence));
  return(taggedSentence);
}

// Remove words from taggedSentence that were not tagged
function stripWordsNotInLexicon(results) {
  var newTaggedSentence = [];
  settings.strippedTokens = [];
  results.taggedSentence.forEach(function(taggedWord) {
    if (taggedWord.length > 1) { 
      // The word has tags -> add to the result
      newTaggedSentence.push(taggedWord);
    }
    else {
      // Add to the stripped tokens
      settings.strippedTokens.push(taggedWord[0]);
    }
  });
  return(newTaggedSentence);
}

function listOfCategories(taggedWord) {
  var list = "";
  taggedWord.forEach(function(tag, index) {
    if (index) { // 0-th index is the word itself
      list += tag.features.category.type.name + ' ';
    }
  });
  return(list);
}

// next is a callback and should be called after tagging has finished
// Was added for the asynchronous calls to Wordnet.
function tagSentence(results, next) {
  logger.debug('inside tagSentence');
  // Tag sentence
  switch (settings.taggingAlgorithm) {
    case "fsPOSTagger":
      results.taggedSentence = settings.tagger.tagSentence(results.tokenizedSentence);
      results.taggedSentencePrettyPrint = '';
      results.taggedSentence.forEach(function(taggedWord) {
        taggedWord.forEach(function(tag, index) {
          if (!index) {
            results.taggedSentencePrettyPrint += tag + '\n';
          }
          else {
            results.taggedSentencePrettyPrint += tag.pretty_print() + '\n';
          }
        });
      });
      results.sentenceLength = results.taggedSentence.length;
      logger.debug(JSON.stringify(results.taggedSentence, null, 2));
      next();
      break;
    case "simplePOSTagger":
      // Assigns a list of lexical categories
      results.taggedSentence = settings.tagger.tag_sentence(results.tokenizedSentence);
      next();
      break;
    case "brillPOSTagger":
      // Assigns a list of lexical categories based on Brill's transformation rules
      next();
      break;
    case "Wordnet":
      settings.tagger(tagged_sentence, function(tagged_sentence) {
        results.taggedSentence = tagged_sentence;
        next();
      });
      break;
    default:
      next();
  }
}

function postProcessTagging(results) {
  // Add function words tags
  if (settings.assignFunctionWordTags) {
    results.taggedSentence = tagFunctionWords(results);
  }

  // Strip words without tags
  if (settings.stripWordsNotInLexicon) {
    results.taggedSentence = stripWordsNotInLexicon(results);
    results.sentenceLength = results.taggedSentence.length;
  }

  // Prepare a comma separated list of categories for pretty printing the chart
  results.taggedSentenceCategories = [];
  results.taggedSentence.forEach(function(taggedWord, i) {
    str = '';
    taggedWord.forEach(function(tag, j) {
      if (j) { // 0-th index is the word itself
        if (GLOBAL.config.LIST_OF_CATEGORIES) {
          str += tag + ', ';
        }
        else {
          str += tag.features.category.type.name + ', ';
        }
      }
    });
    if (str.length) {
      str = str.substring(0, str.length - 2);
    }
    results.taggedSentenceCategories[i] = str;
  });
}

function parseSentence(results) {
  logger.debug('parseSentence: applyAppropriateFunction: ' + settings.applyAppropriateFunction);

  var parser = parserFactory.createParser({
    type: settings.parsingAlgorithm,
    unification: settings.applyUnification,
    grammar: settings.grammar,
    type_lattice: settings.typeLattice,
    appropriate_function: settings.applyAppropriateFunction
  });

  logger.debug('parseSentence: GLOBAL.config.UNIFICATION: ' + GLOBAL.config.UNIFICATION);
  logger.debug('parseSentence: GLOBAL.config.APPROPRIATE_FUNCTION: ' + GLOBAL.config.APPROPRIATE_FUNCTION);

  var start = new Date().getTime();
  results.chart = parser.parse(results.taggedSentence);
  var end = new Date().getTime();
  results.parsingTime = end - start;

  results.fullParseItems = results.chart.full_parse_items(parser.grammar.get_start_symbol(),
    ((settings.parsingAlgorithm === 'HeadCorner') ||
     (settings.parsingAlgorithm === 'CYK'))
    ? 'cyk_item'
    : 'earleyitem');
  results.inLanguage = (results.fullParseItems.length > 0);
  results.nrOfItems = results.chart.nr_of_items();

  // Prepare pretty_prints of the feature structures
  if (settings.applyUnification) {
    results.fullParseItems.forEach(function(item) {
      item.data.fsPretty = item.data.fs.pretty_print();
    });
  }
}

function processSentenceView(req, res) {
  var results = {};

  settings.stripWordsNotInLexicon = (req.body.stripWordsNotInLexicon === 'on');
  settings.applyAppropriateFunction = (req.body.applyAppropriateFunction === 'on');
  settings.parsingAlgorithm = req.body.parsingAlgorithm;
  settings.applyUnification = (req.body.applyUnification === 'on');

  if (settings.tagger && settings.grammar && settings.typeLattice) {
    // Tokenize sentence
    results.sentence = req.body.inputSentence;
    results.tokenizedSentence = settings.tokenizer.tokenize(results.sentence);

    // This function is passed to the tagging function which is asynchronous
    function next() {
      postProcessTagging(results);
      parseSentence(results);
      // Present the results
      res.render('parser_output', {settings: settings, results: results});
    }

    logger.debug('passing next to the tagger');
    tagSentence(results, next);
  }
  else {
    res.render('edit_settings');
  }
}

function documentationView(req, res) {

}

function aboutView(req, res) {

}

function contactView(req, res) {

}

(function main() {
  initialise();
  
  // view engine setup
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');

  app.use(express.static(path.join(__dirname, 'public')));
  app.use(bodyParser.urlencoded({
    extended: true
  }));

  app.get('/home', homeView);

  app.get('/settings', settingsView);
  app.post('/submit_settings', submitSettings);
  
  app.get('/edit_grammar', editGrammarView);
  app.get('/edit_lexicon', editLexiconView);
  app.get('/edit_type_lattice', editTypeLatticeView);
  app.post('/save_file', saveFile);

  app.get('/tokenizer', tokenizerView);
  app.post('/tokenizeSentence', tokenizeSentenceView);

  app.get('/tagger', taggerView);
  app.post('/tagSentence', tagSentenceView);
  
  app.get('/parser', parserView);
  app.post('/parse_sentence', processSentenceView);

  app.get('/documentation', documentationView);
  app.get('/about', aboutView);
  app.get('/contact', contactView);

  server.listen(3000);
})();