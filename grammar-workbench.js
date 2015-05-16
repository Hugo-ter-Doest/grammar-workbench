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

var fs = require('fs');
var path = require('path');

var express = require('express');
var app = express();
var server = require('http').Server(app);

var bodyParser = require('body-parser');
var formidable = require('formidable');

// Chart parser factory
var chartParsers = require('chart-parsers');
var parserFactory = new chartParsers.ParserFactory();
var natural = require('natural');

// Page for loading a grammar
function editSettings(req, res) {
  res.render('settings');
};

function submitSettings(req, res) {
  var form = new formidable.IncomingForm();

  form.parse(req, function(err, fields, files) {
    fs.readFile(files.grammar_file.path, 'utf8', function (error, text) {
      // process the grammar file
    });
  });
};

function editTypeLattice(req, res) {
  res.render('edit_type_lattice');
};

function saveTypeLattice(req, res) {
  
};

function editLexicon(req, res) {
  res.render('edit_lexicon');
};

function saveLexicon(req, res) {
  
};

function editGrammar(req, res) {
  res.render('edit_grammar');
};

function saveGrammar(req, res) {
  
};

// Page for entering a sentence
function inputSentenceParser(req, res) {
  res.render('input_sentence_parser');
};

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
};

function inputSentenceTokenizer(req, res) {
  res.render('parse_sentence');
};

function tokenizeSentence(req, res) {

}

function inputSentenceTagger(req, res) {
  res.render('parse_sentence');
};

function tagSentence(req, res) {

}


(function main() {
  // view engine setup
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');

  app.use(express.static(path.join(__dirname, 'public')));
  app.use(bodyParser.urlencoded({
    extended: true
  }));
  
  app.get('/settings', editSettings);
  app.post('/submitSetting', submitSettings);
  
  app.get('/editTypeLattice', editTypeLattice);
  app.post('/saveTypeLattice', saveTypeLattice);

  app.get('/editLexicon', editLexicon);
  app.post('/saveLexicon', saveLexicon);

  app.get('/editGrammar', editGrammar);
  app.post('/saveGrammar', saveGrammar);
  
  app.get('/inputSentenceTokenizer', inputSentenceTokenizer);
  app.post('/tokenizeSentence', tokenizeSentence);

  app.get('/inputSentenceTagger', inputSentenceTagger);
  app.post('/tagSentence', tagSentence);
  
  app.get('/input_sentence_parser', inputSentenceParser);
  app.post('/parseSentence', parseSentence);

  server.listen(3000);
})();