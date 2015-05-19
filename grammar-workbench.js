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

var natural = require('natural');

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
  settings.lexiconFile = '';
  settings.stripWordsNotInLexicon = false;
  settings.lexicon = null;
  settings.grammarFile = '';
  settings.grammar = null;
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
        // On 'Save' all three files are loaded
        // If the type lattice is not specified lexicon and grammar cannot be 
        // loaded
        settings.applyAppropriateFunction = fields.applyAppropriateFunction;
        settings.stripWordsNotInLexicon = fields.stripWordsNotInLexicon;
        settings.applyUnification = fields.applyUnification;
        settings.typeLatticeFile = '';
        settings.lexiconFile = '';
        settings.grammarFile = '';
        settings.typeLattice = null;
        settings.lexicon = null;
        settings.grammar = null;
        var nr_files_to_process = 3;

        function AllFilesAreProcessed() {
          if (!nr_files_to_process) {
            logger.debug('editSettings: FilesAreProcessed: about to render edit_settings');
            settings.readyToCreateParser = (settings.typeLattice &&
              settings.lexicon && settings.grammar);
            res.render('edit_settings', {settings: settings});
          }
        }

        if (files.typeLatticeFile.name) {
          settings.typeLatticeFile = files.typeLatticeFile.name;
          fs.readFile(files.typeLatticeFile.path, 'utf8', function (error, text) {
            settings.typeLatticeText = text;
            settings.typeLattice = typeLatticeParser.parse(text);
            nr_files_to_process--;
            AllFilesAreProcessed();
          });
        }
        else {
          nr_files_to_process--;
          AllFilesAreProcessed();
        }
       if (files.lexiconFile.name) {
          settings.lexiconFile = files.lexiconFile.name;
          fs.readFile(files.lexiconFile.path, 'utf8', function (error, text) {
            settings.lexiconText = text;
            if (settings.typeLattice) {
              settings.lexicon = lexiconParser.parse(text, {type_lattice: settings.typeLattice});
            }
            nr_files_to_process--;
            AllFilesAreProcessed();
          });
        }
        else {
          nr_files_to_process--;
          AllFilesAreProcessed();
        }
        if (files.grammarFile.name) {
          settings.grammarFile = files.grammarFile.name;
          fs.readFile(files.grammarFile.path, 'utf8', function (error, text) {
            settings.grammarText = text;
            if (settings.typeLattice) {
              settings.grammar = grammarParser.parse(text, {type_lattice: settings.typeLattice});
            }
            nr_files_to_process--;
            AllFilesAreProcessed();
          });
        }
        else {
          nr_files_to_process--;
          AllFilesAreProcessed();
        }
        break;
      default: // Cancel
    }
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
  res.render('input_sentence_parser');
}

// Parse a sentence
function parseSentence(req, res) {
  var sentence = req.body.input_sentence;
  var words = new pos.Lexer().lex(sentence);
  var taggedWords = new pos.Tagger().tag(words);
  var N = taggedWords.length;

  var parser = parserFactory.createParser({'type': req.body.parsingAlgorithm});

  var start = new Date().getTime();
  var chart = parser.parse(taggedWords, listener);
  var end = new Date().getTime();
  
  var full_parse_items = chart.full_parse_items(parser.grammar.get_start_symbol(), 
    ((req.body.parsingAlgorithm === 'HeadCorner') || 
     (req.body.parsingAlgorithm === 'CYK')) ? 'cyk_item' : 'earleyitem');

  res.render('parse_result', {type_of_parser: req.body.parsingAlgorithm,
                              N: N,
                              tagged_sentence: taggedWords,
                              chart: chart,
                              parsing_time: end - start,
                              in_language: full_parse_items.length > 0,
                              parses: full_parse_items,
                              nr_items_created: chart.nr_of_items()});
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
  
  app.get('/input_sentence_parser', inputSentenceParser);
  app.post('/parseSentence', parseSentence);

  server.listen(3000);
})();