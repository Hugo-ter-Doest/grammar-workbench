/*
    Settings module for grammar-workbench
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

var config = {};

//config.workspace = '/Workspace/';
config.workspace = '/home/hugo/Workspace/';
config.log4js_config = config.workspace + 'grammar-workbench/config/log4js.json';
config.documentation = config.workspace + 'grammar-workbench/README.md';

//GLOBAL.config = config;

module.exports = config;