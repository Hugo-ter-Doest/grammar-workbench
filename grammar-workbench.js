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
  settings.tokenizerAlgorithm = 'Word tokenizer';
  settings.regularExpression = '';
  
  settings.typeLatticeFile = '';
  settings.typeLattice = null;
  settings.applyAppropriateFunction = true;
  settings.typeLatticeHasAppropriateFunction = false;

  settings.taggingAlgorithm = '';
  settings.lexiconFile = '';
  settings.stripWordsNotInLexicon = false;
  settings.assignFunctionWordTags = false;
  settings.lexicon = null;
  settings.lexiconHasFeatureStructures = false;
  
  settings.parsingAlgorithm = '';
  settings.grammarInInCNF = false;
  settings.grammarFile = '';
  settings.grammar = null;
  settings.grammarHasUnificationConstraints = false;
  settings.readyToCreateParser = false;
}

// Page for loading a grammar
function editSettings(req, res) {
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
            settings.tokenizer = "wordTokenizer";
        }
        
        // Process type lattice settings
        settings.applyAppropriateFunction = fields.applyAppropriateFunction
          ? true
          : false;
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
        settings.stripWordsNotInLexicon = fields.stripWordsNotInLexicon
          ? true
          : false;
        settings.assignFunctionWordTags = fields.assignFunctionWordTags
          ? true
          : false;
        if (files.lexiconFile.name) {
          settings.lexiconFile = files.lexiconFile.name;
          settings.lexiconText = fs.readFileSync(files.lexiconFile.path, 'utf8');
          switch (settings.taggingAlgorithm) {
            case "fsPOSTagger":
              if (settings.typeLattice) {
                settings.tagger = lexiconParser.parse(settings.lexiconText, 
                  {type_lattice: settings.typeLattice});
              }
              break;
            case "simplePOSTagger":
              // Assigns a list of lexical categories
              settings.tagger = new simplePOSTagger(settings.lexiconFile);
              break;
            case "brillPOSTagger":
              // Assigns a list of lexical categories based on Brill's transformation rules
              break;
            case "Wordnet":
              settings.tagger = tag_sentence_wordnet;
              break;
            default:
              var lexicon = lexiconParser.parse(settings.lexiconText, 
                {type_lattice: settings.typeLattice});
              settings.tagger = lexicon;
          }
        }

        // Process parser settings
        settings.applyUnification = fields.applyUnification
        ? true
        : false;
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

function editTypeLattice(req, res) {
  res.render('edit_file', {settings: settings, fileToEdit: TYPE_LATTICE_FILE});
}

function editLexicon(req, res) {
  res.render('edit_file', {settings: settings, fileToEdit: LEXICON_FILE});
}

function editGrammar(req, res) {
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

// Page for entering a sentence
function inputSentenceParser(req, res) {
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
function tag_sentence_wordnet(tagged_sentence, callback) {
  var wordnet = new natural.WordNet();
  var wordnet_results = {};
  var nr_tokens = tagged_sentence.length;

  tagged_sentence.forEach(function(tagged_word) {
    logger.debug("tag_sentence: processing " + tagged_word);
    wordnet.lookup(tagged_word[0], function(results) {
      results.forEach(function(result) {
        if (tagged_word.lastIndexOf(result.pos) <= 0) {
          tagged_word.push(result.pos);
          logger.debug("Lexical category of " + tagged_word[0] + " is: " + result.pos);
        }
      });

      nr_tokens--;
      if (nr_tokens === 0) {
        logger.info("Exit tag_sentence_wordnet: " + JSON.stringify(tagged_sentence));
        callback(tagged_sentence);
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
  results.taggedSentence.forEach(function(taggedWord) {
    if (taggedWord.length > 1) { 
      // The word has tags
      newTaggedSentence.push(taggedWord);
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

// Parse a sentence
function parseSentence(req, res) {
  var sentence = req.body.inputSentence;
  var results = {};

  // Tokenize sentence
  results.tokenizedSentence = settings.tokenizer.tokenize(sentence);
  
  // Tag sentence
  settings.stripWordsNotInLexicon = req.body.stripWordsNotInLexicon
    ? true
    : false;
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
      Continue();
      break;
    case "simplePOSTagger":
      // Assigns a list of lexical categories
      results.taggedSentence = settings.tagger.tag_sentence(results.tokenizedSentence);
      Continue();
      break;
    case "brillPOSTagger":
      // Assigns a list of lexical categories based on Brill's transformation rules
      Continue();
      break;
    case "Wordnet":
      settings.tagger(tagged_sentence, function(tagged_sentence) {
        results.taggedSentence = tagged_sentence;
        Continue();
      });
      break;
    default:
      Continue();
  }

  
  function Continue() {
    // Postprocess tagging: add function words tags
    if (settings.assignFunctionWordTags) {
      results.taggedSentence = tagFunctionWords(results);
    }

    // Postprocess tagging: strip words without tags
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

    // Parse sentence
    settings.parsingAlgorithm = req.body.parsingAlgorithm;
    settings.applyAppropriateFunction = req.body.applyAppropriateFunction
      ? true
      : false;
    logger.debug('parseSentence: applyAppropriateFunction: ' + settings.applyAppropriateFunction );
    settings.applyUnification = req.body.applyUnification
      ? true
      : false;
    if (settings.tagger && settings.grammar && settings.typeLattice) {
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
        ((req.body.parsingAlgorithm === 'HeadCorner') ||
         (req.body.parsingAlgorithm === 'CYK'))
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

      // Present the results
      res.render('parser_output', {settings: settings, results: results});
    }
    else {
      res.render('edit_settings');
    }
  }
}

function inputSentenceTokenizer(req, res) {
  res.render('parse_sentence');
}

function tokenizeSentence(req, res) {

}

function inputSentenceTagger(req, res) {
  res.render('parse_sentence');
}

function tagSentence(req, res) {

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
  
  app.get('/edit_settings', editSettings);
  app.post('/submit_settings', submitSettings);
  
  app.get('/edit_grammar', editGrammar);
  app.get('/edit_lexicon', editLexicon);
  app.get('/edit_type_lattice', editTypeLattice);
  app.post('/save_file', saveFile);

  app.get('/inputSentenceTokenizer', inputSentenceTokenizer);
  app.post('/tokenizeSentence', tokenizeSentence);

  app.get('/inputSentenceTagger', inputSentenceTagger);
  app.post('/tagSentence', tagSentence);
  
  app.get('/input_sentence', inputSentenceParser);
  app.post('/parse_sentence', parseSentence);

  server.listen(3000);
})();