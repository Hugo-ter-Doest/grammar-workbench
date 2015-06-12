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

var md = require('marked');

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
var results = {};

var TYPE_LATTICE_FILE = 0;
var LEXICON_FILE = 1;
var GRAMMAR_FILE = 2;

function initialise() {
  // Tokenizer settings
  settings.tokenizerAlgorithm = '';
  settings.regularExpression = '';

  // Stemmer settings
  settings.stemmerAlgorithm = '';
  settings.applyStemmer = false;
  settings.stemmer = null;

  // Type lattice settings
  settings.typeLatticeFile = '';
  settings.typeLattice = null;
  settings.typeLatticeText = '';
  settings.applyAppropriateFunction = true;
  settings.typeLatticeHasAppropriateFunction = false;

  // Tagger settings
  settings.taggingAlgorithm = '';
  settings.lexiconFile = '';
  settings.lexiconText = '';
  settings.stripWordsNotInLexicon = false;
  settings.assignFunctionWordTags = false;
  settings.tagger = null;
  settings.lexiconHasFeatureStructures = false;

  // Parser settings
  settings.parsingAlgorithm = '';
  settings.grammarInInCNF = false;
  settings.grammarFile = '';
  settings.grammarText = '';
  settings.grammar = null;
  settings.parser = null;
  settings.grammarHasUnificationConstraints = false;
  settings.applyUnification = false;
}

function homeView(req, res) {
  res.render('settings', {settings: settings, results: results})
}

function settingsView(req, res) {
  res.render('settings', {settings: settings});
}

function createTokenizer(settings) {
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
}

function createStemmer(settings) {
  switch(settings.stemmerAlgorithm) {
    case 'PorterStemmer':
      settings.stemmer = natural.PorterStemmer;
      break;
    case 'LancasterStemmer':
      settings.stemmer = natural.LancasterStemmer;
      break;
    default:
      settings.stemmerAlgorithm = 'PorterStemmer';
      settings.stemmer = natural.PorterStemmer;
  }
}

function createTypeLattice(settings) {
  settings.typeLattice = typeLatticeParser.parse(settings.typeLatticeText);
  settings.typeLatticePrettyPrint = settings.typeLattice.pretty_print();
  settings.typeLatticeHasAppropriateFunction =
    (settings.typeLattice.appropriate_function !== null);
  logger.debug("createTypeLattice: created a new type lattice");
}

function createTagger(settings) {
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
      settings.tagger = new simplePOSTagger(settings.lexiconPath, false);
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
      settings.taggingAlgorithm = 'fsPOSTagger';
      settings.tagger = lexiconParser.parse(settings.lexiconText,
        {type_lattice: settings.typeLattice});
      GLOBAL.config.LIST_OF_CATEGORIES = false;
      settings.lexiconHasFeatureStructures = true;
  }
}


function createParser(settings) {
  if (settings.typeLattice) {
    settings.grammar = grammarParser.parse(settings.grammarText,
      {type_lattice: settings.typeLattice});
    logger.debug("createParser: created a new grammar");
    settings.grammarHasUnificationConstraints = settings.grammar.hasUnificationConstraints;
    settings.grammarIsInCNF = settings.grammar.is_CNF;
    logger.debug("createParser: grammar is in CNF: " + settings.grammarIsInCNF);
  }
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
      case 'Apply':
        // Process tokenizer settings
        settings.tokenizerAlgorithm = fields.tokenizerAlgorithm;
        settings.regularExpression = fields.regularExpression;
        createTokenizer(settings);

        // Process stemmer settings
        settings.applyStemmer = (fields.applyStemmer === 'on');
        settings.stemmerAlgorithm = fields.stemmerAlgorithm;
        createStemmer(settings);

        // Process type lattice settings
        settings.applyAppropriateFunction = (fields.applyAppropriateFunction === 'on');
        if (files.typeLatticeFile.name) {
          settings.typeLatticeFile = files.typeLatticeFile.name;
          settings.typeLatticeText = fs.readFileSync(files.typeLatticeFile.path, 'utf8');
          createTypeLattice(settings);
        }

        // Process tagger settings
        settings.taggingAlgorithm = fields.taggingAlgorithm;
        settings.stripWordsNotInLexicon = (fields.stripWordsNotInLexicon === 'on');
        settings.assignFunctionWordTags = (fields.assignFunctionWordTags === 'on');
        if (files.lexiconFile.name) {
          settings.lexiconFile = files.lexiconFile.name;
          settings.lexiconPath = files.lexiconFile.path;
          settings.lexiconText = fs.readFileSync(files.lexiconFile.path, 'utf8');
          createTagger(settings);
        }

        // Process parser settings
        settings.applyUnification = (fields.applyUnification === 'on');
        settings.parsingAlgorithm = fields.parsingAlgorithm;
        if (files.grammarFile.name) {
          settings.grammarFile = files.grammarFile.name;
          settings.grammarText = fs.readFileSync(files.grammarFile.path, 'utf8');
          createParser(settings);
        }
        break;
      default: 
        // Cancel
    }
    res.render('settings', {settings: settings, results: results});
  });
}

function uploadSettingsView(req, res) {
  res.render('upload_settings', {settings: settings});
}

function uploadSettings(req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function (err, fields, files) {
    if (files.settingsFile) {
      settings.settingsFile = files.settingsFile.name;
      var data = fs.readFileSync(files.settingsFile.path, 'utf8');
      settings = JSON.parse(data);
      createTokenizer(settings);
      createTypeLattice(settings);
      createTagger(settings);
      createParser(settings);
    }
    res.render('settings', {settings: settings, results: results});
  });
}

function downloadSettingsView(req, res) {
  var s = {};
  // Tokenizer settings
  s.tokenizerAlgorithm = settings.tokenizerAlgorithm;
  s.regularExpression = settings.regularExpression;

  // Type lattice settings
  s.typeLatticeFile = settings.typeLatticeFile;
  s.typeLatticeText = settings.typeLatticeText;
  s.applyAppropriateFunction = settings.applyAppropriateFunction;
  s.typeLatticeHasAppropriateFunction = settings.typeLatticeHasAppropriateFunction;

  // Tagger settings
  s.taggingAlgorithm = settings.taggingAlgorithm;
  s.lexiconFile = settings.lexiconFile;
  s.lexiconText = settings.lexiconText;
  s.stripWordsNotInLexicon = settings.stripWordsNotInLexicon;
  s.assignFunctionWordTags = settings.assignFunctionWordTags;
  s.lexiconHasFeatureStructures = settings.lexiconHasFeatureStructures;

  // Parser settings
  s.parsingAlgorithm = settings.parsingAlgorithm;
  s.grammarInInCNF = settings.grammarIsInCNF;
  s.grammarFile = settings.grammarFile;
  s.grammarText = settings.grammarText;
  s.grammarHasUnificationConstraints = settings.grammarHasUnificationConstraints;
  s.applyUnification = settings.applyUnification;
  
  res.attachment('settings.json');
  res.end(JSON.stringify(s, null, 2), 'utf8');
}

function typeLatticeView(req, res) {
  res.render('type_lattice', {settings: settings, results: results});
}

function showType(req, res) {
  logger.debug('showType: type: ' + req.body.typeToShow);
  var type = settings.typeLattice.get_type_by_name(req.body.typeToShow);
  if (type) {
    results.typePrettyPrint = type.prettyPrintWithSuperTypes();
  }
  else {
    results.typePrettyPrint = 'Could not find type';
  }
  res.render('type_lattice', {settings: settings, results: results});
}

// Process type lattice settings
function saveTypeLatticeSettings(req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function (err, fields, files) {
    settings.applyAppropriateFunction = (fields.applyAppropriateFunction === 'on');
    if (files.typeLatticeFile.name) {
      settings.typeLatticeFile = files.typeLatticeFile.name;
      settings.typeLatticeText = fs.readFileSync(files.typeLatticeFile.path, 'utf8');
      createTypeLattice(settings);
    }
    res.render('type_lattice', {settings: settings, results: results});
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
        res.redirect('settings');
        break;
      default:
    }   
  });
}

// Process tokenizer settings
function saveTokenizerSettings(req, res) {
  settings.tokenizerAlgorithm = req.body.tokenizerAlgorithm;
  settings.regularExpression = req.body.regularExpression;
  createTokenizer(settings);
  res.render('tokenizer', {settings: settings, results: results});
}

function tokenizerView(req, res) {
  res.render('tokenizer', {settings: settings, results: results});
}

function tokenizeSentenceView(req, res) {
  results.sentence = req.body.inputSentence;
  // Tokenize sentence
  results.tokenizedSentence = settings.tokenizer.tokenize(results.sentence);
  res.render('tokenizer', {settings: settings, results: results});
}

// Process stemmer settings
function saveStemmerSettings(req, res) {
  settings.applyStemmer = (req.body.applyStemmer === 'on');
  settings.stemmerAlgorithm = req.body.stemmerAlgorithm;
  createStemmer(settings);
  res.render('stemmer', {settings: settings, results: results});
}

function stemmerView(req, res) {
  res.render('stemmer', {settings: settings, results: results});
}

function stemSentence(settings, results) {
  if (settings.applyStemmer) {
    results.stemmedSentence = [];
    results.tokenizedSentence.forEach(function(token) {
      results.stemmedSentence.push(settings.stemmer.stem(token));
    });
  }
  else {
    results.stemmedSentence = results.tokenizedSentence;
  }
}

function stemSentenceView(req, res) {
  results.sentence = req.body.inputSentence;
  // Tokenize sentence
  results.tokenizedSentence = settings.tokenizer.tokenize(results.sentence);
  // Stem sentence
  stemSentence(settings, results);
  res.render('stemmer', {settings: settings, results: results});
}

function taggerView(req, res) {
  res.render('tagger', {settings: settings, results: results});
}

function saveTaggerSettings(req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function (err, fields, files) {
    settings.taggingAlgorithm = fields.taggingAlgorithm;
    settings.stripWordsNotInLexicon = (fields.stripWordsNotInLexicon === 'on');
    settings.assignFunctionWordTags = (fields.assignFunctionWordTags === 'on');
    if (files.lexiconFile) {
      settings.lexiconFile = files.lexiconFile.name;
      settings.lexiconText = fs.readFileSync(files.lexiconFile.path, 'utf8');
      createTagger(settings);
    }
    res.render('tagger', {settings: settings, results: results});
  });
}

function tagSentenceView(req, res) {
  if (settings.tokenizer && settings.tagger) {
    results.sentence = req.body.inputSentence;
    logger.debug('tagSentenceView: ' + results.sentence);
    results.tokenizedSentence = settings.tokenizer.tokenize(results.sentence);
    // Stem sentence
    stemSentence(settings, results);

    tagSentence(function () {
      res.render('tagger', {settings: settings, results: results});
    });
  }
  else {
    logger.debug('tagSentenceView: could not tag sentence');
  }
}

// Page for entering a sentence
function parserView(req, res) {
  res.render('parser', {settings: settings, results: results});
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

function saveParserSettings(req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function (err, fields, files) {
    settings.applyUnification = (fields.applyUnification === 'on');
    settings.parsingAlgorithm = fields.parsingAlgorithm;
    if (files.grammarFile.name) {
      settings.grammarFile = files.grammarFile.name;
      settings.grammarText = fs.readFileSync(files.grammarFile.path, 'utf8');
      createParser(settings);
    }
    res.render('parser', {settings: settings, results: results});
  });
}

// Adds function word tags to the already assigned tags
function tagFunctionWords() {
  var taggedSentence = results.taggedSentence;
  
  logger.debug("Enter tagFunctionWords( " + taggedSentence + ")");
  var tagger = new simplePOSTagger(functionWordsConfigFile, false);
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
function stripWordsNotInLexicon(settings, results) {
  if (settings.stripWordsNotInLexicon) {
    var newTaggedSentence = [];
    settings.strippedTokens = [];
    results.taggedSentence.forEach(function (taggedWord) {
      if (taggedWord.length > 1) {
        // The word has tags -> add to the result
        newTaggedSentence.push(taggedWord);
      }
      else {
        // Add to the stripped tokens
        results.strippedTokens.push(taggedWord[0]);
      }
    });
    results.taggedSentence = newTaggedSentence;
    results.sentenceLength = newTaggedSentence.length;
  }
}

// next is a callback and should be called after tagging has finished
// Was added for the asynchronous calls to Wordnet.
function tagSentence(next) {
  logger.debug('inside tagSentence');
  // Tag sentence
  switch (settings.taggingAlgorithm) {
    case "fsPOSTagger":
      // Assigns a list of feature structures
      results.taggedSentence = settings.tagger.tagSentence(results.stemmedSentence);
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
      results.taggedSentence = settings.tagger.tag_sentence(results.stemmedSentence);
      next();
      break;
    case "brillPOSTagger":
      // Assigns a list of lexical categories based on Brill's transformation rules
      next();
      break;
    case "Wordnet":
      // Assigns a list of lexical categories
      settings.tagger(results.stemmedSentence, function(tagged_sentence) {
        results.taggedSentence = tagged_sentence;
        next();
      });
      break;
    default:
      next();
  }
}

function postProcessTagging() {
  // Add function words tags
  if (settings.assignFunctionWordTags) {
    results.taggedSentence = tagFunctionWords(results);
  }

  // Strip words without tags
  stripWordsNotInLexicon(settings, results);

  // Prepare a comma separated list of categories for pretty printing the chart
  results.taggedSentenceCategories = [];
  results.taggedSentence.forEach(function(taggedWord, i) {
    var str = '';
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

function parseSentence() {
  logger.debug('parseSentence: applyAppropriateFunction: ' + settings.applyAppropriateFunction);

  settings.parser = parserFactory.createParser({
    type: settings.parsingAlgorithm,
    unification: settings.applyUnification,
    grammar: settings.grammar,
    type_lattice: settings.typeLattice,
    appropriate_function: settings.applyAppropriateFunction
  });

  logger.debug('parseSentence: GLOBAL.config.UNIFICATION: ' + GLOBAL.config.UNIFICATION);
  logger.debug('parseSentence: GLOBAL.config.APPROPRIATE_FUNCTION: ' + GLOBAL.config.APPROPRIATE_FUNCTION);

  var start = new Date().getTime();
  results.chart = settings.parser.parse(results.taggedSentence);
  var end = new Date().getTime();
  results.parsingTime = end - start;

  results.fullParseItems = results.chart.full_parse_items(settings.parser.grammar.get_start_symbol(),
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

function parseSentenceView(req, res) {
  results = {};

  if (settings.tokenizer && settings.tagger && settings.grammar && settings.typeLattice) {
    // Tokenize sentence
    results.sentence = req.body.inputSentence;
    results.tokenizedSentence = settings.tokenizer.tokenize(results.sentence);

    // Stem sentence
    stemSentence(settings, results);

    // This function is passed to the tagging function which is asynchronous
    function next() {
      postProcessTagging();
      parseSentence();
      // Present the results
      res.render('parser', {settings: settings, results: results});
    }

    logger.debug('passing next to the tagger');
    tagSentence(next);
  }
  else {
    res.render('settings');
  }
}

function documentationView(req, res) {
  var doc = fs.readFileSync(server_settings.documentation, 'utf8');
  res.render('documentation', { md: md, documentation: doc });
}

function contactView(req, res) {
  res.render('contact', {title: 'Contact information'});
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

  app.get('/', homeView);
  app.get('/home', homeView);

  app.get('/settings', settingsView);
  app.get('/upload_settings', uploadSettingsView);
  app.post('/upload_settings', uploadSettings);
  app.get('/download_settings', downloadSettingsView);
  app.post('/submit_settings', submitSettings);

  app.get('/edit_grammar', editGrammarView);
  app.get('/edit_lexicon', editLexiconView);
  app.get('/edit_type_lattice', editTypeLatticeView);
  app.post('/save_file', saveFile);

  app.get('/tokenizer', tokenizerView);
  app.post('/save_tokenizer_settings', saveTokenizerSettings);
  app.post('/tokenize_sentence', tokenizeSentenceView);

  app.get('/stemmer', stemmerView);
  app.post('/save_stemmer_settings', saveStemmerSettings);
  app.post('/stem_sentence', stemSentenceView);

  app.get('/type_lattice', typeLatticeView);
  app.post('/show_type', showType);
  app.post('/save_type_lattice_settings', saveTypeLatticeSettings);

  app.get('/tagger', taggerView);
  app.post('/tag_sentence', tagSentenceView);
  app.post('/save_tagger_settings', saveTaggerSettings);

  app.get('/parser', parserView);
  app.post('/save_parser_settings', saveParserSettings);
  app.post('/parse_sentence', parseSentenceView);

  app.get('/documentation', documentationView);
  app.get('/contact', contactView);

  server.listen(3000);
})();