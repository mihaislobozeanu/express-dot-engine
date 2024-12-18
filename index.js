
/**
 * Modifyed by Paul Mihailescu https://github.com/Paul1324, on 2024.07.22
 * added support for asyncronous templates
 * created the renderAsync and renderStringAsync function for templates that can contain top level async/await
 */

const _ = require('lodash');
const fs = require('fs');
const fsPromises = require('fs').promises;
const dot = require('@eligo-public/dot');
const path = require('path');
const yaml = require('js-yaml');

/**
* Engine settings
*/
const settings = {
  config: /^---([\s\S]+?)---/g,
  comment: /<!--([\s\S]+?)-->/g,
  partialAsync: /(?<!await\s+)\bpartial\s*\([^)]*\)/g,
  header: '',

  stripComment: false,
  stripWhitespace: false, // shortcut to dot.strip

  dot: {
    evaluate: /\[\[([\s\S]+?)]]/g,
    interpolate: /\[\[=([\s\S]+?)]]/g,
    encode: /\[\[!([\s\S]+?)]]/g,
    use: /\[\[#([\s\S]+?)]]/g,
    define: /\[\[##\s*([\w\.$]+)\s*(:|=)([\s\S]+?)#]]/g,
    conditional: /\[\[\?(\?)?\s*([\s\S]*?)\s*]]/g,
    iterate: /\[\[~\s*(?:]]|([\s\S]+?)\s*:\s*([\w$]+)\s*(?::\s*([\w$]+))?\s*]])/g,
    varname: 'layout, partial, locals, model',
    strip: false,
    append: true,
    selfcontained: false
  }
};

/**
* Cache store
*/
const cache = {
  cache: {},

  get: function (key) {
    return this.cache[key];
  },
  set: function (key, value) {
    this.cache[key] = value;
  },
  clear: function () {
    this.cache = {};
  }
};

/**
* Async cache store
*/
const asyncCache = {
  cache: {},

  get: function (key) {
    return this.cache[key];
  },
  set: function (key, value) {
    this.cache[key] = value;
  },
  clear: function () {
    this.cache = {};
  }
};

/**
* Server-side helper
*/
function DotDef(options) {
  this.options = options;
  this.dirname = options.dirname;
  this.model = options;
}

DotDef.prototype = {

  partial: function (partialPath) {

    console.log('DEPRECATED: ' +
      'Please use the new syntax for partials' +
      ' [[= partial(\'path/to/partial\') ]]'
    );

    const template = getTemplate(
      path.join(this.dirname || this.model.settings.views, partialPath),
      this.model
    );

    return template.render({ model: this.model, isPartial: true, });
  }

};
function DotDefAsync(options) {
  this.options = options;
  this.dirname = options.dirname;
  this.model = options;
}

DotDefAsync.prototype = {

  partial: function (partialPath) {

    console.log('DEPRECATED: ' +
      'Please use the new syntax for partials' +
      ' [[= partial(\'path/to/partial\') ]]'
    );

    return getTemplateAsync(path.join(this.dirname || this.model.settings.views, partialPath), this.model)
      .then((template) => template.render({ model: this.model, isPartial: true, }));
  }

};

/**
* @constructor Template object with a layout structure. This object is cached
* if the 'options.cache' set by express is true.
* @param {Object} options The constructor parameters:
*
* {Object} engine The option from the engine
*
* There are 2 options
*
* Case 1: A layout view
* {String} master The master template filename
* {Object} sections A key/value containing the sections of the template
*
* Case 2: A standalone view
* {String} body The template string
*/
function Template(options, isAsync) {
  const self = this;
  self.options = options;
  self.isAsync = !!isAsync;

  // layout
  self.isLayout = !!options.config.layout;
  self.master = self.isLayout ?
    path.join(options.dirname, options.config.layout) :
    null;

  // build the doT templates
  self.templates = {};
  self.settings = _.clone(settings.dot);
  self.def = self.isAsync ? new DotDefAsync(options) : new DotDef(options);

  // view data
  self.viewData = [];
  if (_.has(options.express, 'settings')
    && _.has(options.express.settings, 'view data')
  ) {
    self.settings.varname = _.reduce(
      options.express.settings['view data'],
      function (result, value, key) {
        self.viewData.push(value);
        return result + ', ' + key;
      },
      settings.dot.varname
    );
  }

  // view shortcut
  self.shortcuts = [];
  if (_.has(options.express, 'settings')
    && _.has(options.express.settings, 'view shortcut')
  ) {
    self.shortcuts = options.express.settings['view shortcut'];
    self.settings.varname += ', ' + _.keys(self.shortcuts).join();
  }

  if (!self.isAsync) {
    self.init();
  }
}

//Creates the section template functions
Template.prototype.init = function () {
  const self = this,
    options = self.options;
  // doT template
  for (let key in options.sections) {
    if (options.sections.hasOwnProperty(key)) {
      self.templates[key] = dot.template(
        options.sections[key],
        self.settings,
        self.def
      );
    }
  }
}

//Creates the section template functions asyncrounously
Template.prototype.initAsync = function () {
  const self = this,
    sections = self.options.sections;
  const templatePromises = Object.keys(sections)
    .map(key => {
      if (sections.hasOwnProperty(key)) {
        return dot.templateAsync(sections[key], self.settings, self.def)
          .then((t) => self.templates[key] = t)
      }
    });
  return Promise.all(templatePromises);
};

/**
 * Partial method helper
 * @param {Object} layout The layout to pass to the view
 * @param {Object} model The model to pass to the view
 */
Template.prototype.createPartialHelper = function (layout, model) {
  const self = this;

  return function (partialPath) {
    const self = this,
      args = [].slice.call(arguments, 1),
      getTemplateFunc = self.isAsync ? getTemplateAsync : getTemplate,
      templatePath = path.join(self.options.dirname || self.options.express.settings.views, partialPath);

    if (args.length) {
      model = _.assign.apply(_, [
        {},
        model
      ].concat(args));
    }

    const renderOptions = { layout: layout, model: model, isPartial: true };

    if (self.isAsync) {
      return getTemplateFunc(templatePath, self.options.express)
        .then(template => template.renderAsync(renderOptions));
    } else {
      const template = getTemplateFunc(templatePath, self.options.express);
      return template.render(renderOptions);
    }
  }.bind(self);
};

/**
* Renders the template.
* If callback is passed, it will be called asynchronously.
* @param {Object} options Options to pass to the view
* @param {Object} [options.layout] The layout key/value
* @param {Object} options.model The model to pass to the view
* @param {Function} [callback] (Optional) The async node style callback
*/
Template.prototype.render = function (options, callback) {
  const self = this,
    isAsync = callback && typeof callback === 'function',
    layout = options.layout,
    model = options.model,
    layoutModel = _.merge({}, layout, this.options.config);

  // render the sections
  for (let key in this.templates) {
    if (this.templates.hasOwnProperty(key)) {
      try {

        const viewModel = _.union(
          [
            layoutModel,
            this.createPartialHelper(layoutModel, model),
            options.model._locals || {},
            model
          ],
          this.viewData,
          _.chain(this.shortcuts)
            .keys()
            .map(function (shortcut) {
              return options.model._locals[this.shortcuts[shortcut]] || null;
            }, this)
            .valueOf()
        );

        layoutModel[key] = this.templates[key].apply(
          this.templates[key],
          viewModel
        );
      }
      catch (err) {
        const error = new Error(`Failed to render with doT (${self.options.filename}) - ${err.toString()}`);

        if (isAsync) {
          callback(error);
          return;
        }
        throw error;
      }
    }
  }

  // no layout
  if (!this.isLayout) {

    // append the header to the master page
    const result = (!options.isPartial ? settings.header : '') + layoutModel.body;

    if (isAsync) {
      callback(null, result);
    }
    return result;
  }

  // render the master sync
  if (!isAsync) {
    const masterTemplate = getTemplate(this.master, this.options.express);
    return masterTemplate.render({ layout: layoutModel, model: model, });
  }

  // render the master async
  getTemplate(this.master, this.options.express, function (err, masterTemplate) {
    if (err) {
      callback(err);
      return;
    }

    return masterTemplate.render({ layout: layoutModel, model: model, }, callback);
  });
};

/**
* Renders the template assuming that it can contain asynchronous calls
* @param {Object} options Options to pass to the view
* @param {Object} [options.layout] The layout key/value
* @param {Object} options.model The model to pass to the view
*/
Template.prototype.renderAsync = function (options) {
  const self = this,
    layout = options.layout,
    model = options.model,
    layoutModel = _.merge({}, layout, this.options.config);

  // render the sections
  const sectionPromisses = Object.keys(self.templates)
    .map((key) => {
      if (self.templates.hasOwnProperty(key)) {
        try {

          const viewModel = _.union(
            [
              layoutModel,
              self.createPartialHelper(layoutModel, model),
              options.model._locals || {},
              model
            ],
            self.viewData,
            _.chain(self.shortcuts)
              .keys()
              .map(function (shortcut) {
                return options.model._locals[self.shortcuts[shortcut]] || null;
              }, self)
              .valueOf()
          );

          return self.templates[key].apply(self.templates[key], viewModel)
            .then((m) => layoutModel[key] = m);

        }
        catch (err) {
          throw new Error(`Failed to render with doT (${self.options.filename}) - ${err.toString()}`);
        }
      }
    });
  return Promise.all(sectionPromisses)
    .then(() => {
      // no layout
      if (!self.isLayout) {
        // append the header to the master page
        const result = (!options.isPartial ? settings.header : '') + layoutModel.body;
        return result;
      }

      return getTemplateAsync(self.master, self.options.express)
        .then((masterTemplate) => masterTemplate.renderAsync({ layout: layoutModel, model: model, }));
    });
};

/**
* Retrieves a template given a filename.
* Uses cache for optimization (if options.cache is true).
* If callback is passed, it will be called asynchronously.
* @param {String} filename The path to the template
* @param {Object} options The option sent by express
* @param {Function} [callback] (Optional) The async node style callback
*/
function getTemplate(filename, options, callback) {
  const isAsync = callback && typeof callback === 'function',
    cacheTemplate = !!options.cache;

  // cache
  if (cacheTemplate) {
    const fromCache = cache.get(filename);
    if (fromCache) {
      //console.log('cache hit');
      if (isAsync) {
        callback(null, fromCache);
      }

      return fromCache;
    }
    //console.log('cache miss');
  }

  // function to call when retieved template
  function done(err, template) {

    // cache
    if (cacheTemplate && template) {
      cache.set(filename, template);
    }

    if (isAsync) {
      callback(err, template);
    }

    return template;
  }

  // sync
  if (!isAsync) {
    return done(null, buildTemplate(filename, options));
  }

  // async
  buildTemplate(filename, options, done);
}

function getTemplateAsync(filename, options) {
  const cacheTemplate = !!options?.cache;
  // cache
  if (cacheTemplate) {
    const fromCache = asyncCache.get(filename);
    if (fromCache) {
      //console.log('asyncCache hit');
      return Promise.resolve(fromCache);
    }
    //console.log('asyncCache miss');
  }

  return buildTemplateAsync(filename, options)
    .then((template) => {
      if (cacheTemplate && template) {
        asyncCache.set(filename, template);
      }
      return template;
    });
}

/**
 * Builds a template
 * If callback is passed, it will be called asynchronously.
 * @param {String} filename The path or the name to the template
 * @param {Object} options The options sent by express
 * @param {Function} callback (Optional) The async node style callback
 */
function buildTemplate(filename, options, callback) {
  const isAsync = callback && typeof callback === 'function',
    getTemplateContentFn = options.getTemplate && typeof options.getTemplate === 'function' ? options.getTemplate : getTemplateContentFromFile;

  // sync
  if (!isAsync) {
    return builtTemplateFromString(
      getTemplateContentFn(filename, options),
      filename,
      options
    );
  }

  // function to call when retrieved template content
  function done(err, templateText) {
    callback(err, builtTemplateFromString(templateText, filename, options));
  }

  getTemplateContentFn(filename, options, done);
}

function buildTemplateAsync(filename, options) {
  const getTemplateContentFn = options.getTemplate && typeof options.getTemplate === 'function' ? options.getTemplate
    : () => fsPromises.readFile(filename, 'utf8');

  return Promise.resolve(getTemplateContentFn(filename, options))
    .then((templateText) => builtTemplateFromStringAsync(templateText, filename, options));
}

/**
 * Gets the template content from a file
 * If callback is passed, it will be called asynchronously.
 * @param {String} filename The path to the template
 * @param {Object} options The options sent by express
 * @param {Function} callback (Optional) The async node style callback
 */
function getTemplateContentFromFile(filename, options, callback) {
  const isAsync = callback && typeof callback === 'function';

  // sync
  if (!isAsync) {
    return fs.readFileSync(filename, 'utf8');
  }

  // async
  fs.readFile(filename, 'utf8', function (err, str) {
    if (err) {
      callback(new Error('Failed to open view file (' + filename + ')'));
      return;
    }

    try {
      callback(null, str);
    }
    catch (err) {
      callback(err);
    }
  });
}
/**
 * Processes a template string and prepares configuration and sections
 * @param {String} str The template string
 * @param {Object} options The options sent by express
 * @return {Object} An object containing processed data
 */
function processTemplateString(str, options, isAsync) {
  let config = {};

  // config at the beginning of the file
  str.replace(settings.config, function (m, conf) {
    config = yaml.load(conf);
  });

  // strip comments
  if (settings.stripComment) {
    str = str.replace(settings.comment, function (m, code, assign, value) {
      return '';
    });
  }

  // strip whitespace
  if (settings.stripWhitespace) {
    settings.dot.strip = settings.stripWhitespace;
  }

  // layout sections
  let sections = {},
    partial = isAsync ? (str) => str.replace(settings.partialAsync, 'await $&') : (str) => str;

  if (!config.layout) {
    sections.body = partial(str);
  } else {
    str.replace(settings.dot.define, function (m, code, assign, value) {
      sections[code] = partial(value);
    });
  }

  const templateSettings = _.pick(options, ['settings']);
  options.getTemplate && (templateSettings.getTemplate = options.getTemplate);
  templateSettings.cache = options.cache || false;

  return { config, sections, templateSettings };
}

/**
* Builds a template from a string
* @param {String} str The template string
* @param {String} filename The path to the template
* @param {Object} options The options sent by express
* @return {Template} The template object
*/
function builtTemplateFromString(str, filename, options) {
  try {
    const { config, sections, templateSettings } = processTemplateString(str, options, false);

    return new Template({
      express: templateSettings,
      config: config,
      sections: sections,
      dirname: path.dirname(filename),
      filename: filename
    });
  } catch (err) {
    throw new Error(
      'Failed to build template' +
      ' (' + filename + ')' +
      ' - ' + err.toString()
    );
  }
}

/**
 * Builds an async template from a string
 * @param {String} str The template string
 * @param {String} filename The path to the template
 * @param {Object} options The options sent by express
 * @return {Promise<Template>} A promise that resolves to the template object
 */
function builtTemplateFromStringAsync(str, filename, options) {
  try {
    const { config, sections, templateSettings } = processTemplateString(str, options, true);

    const asyncTemplate = new Template({
      express: templateSettings,
      config: config,
      sections: sections,
      dirname: path.dirname(filename),
      filename: filename
    }, true);

    return asyncTemplate.initAsync().then(() => asyncTemplate);
  } catch (err) {
    throw new Error(`Failed to build template (${filename}) - ${err.toString()}`);
  }
}

/**
* Render a template
* @param {String} filename The path to the file
* @param {Object} options The model to pass to the view
* @param {Function} callback (Optional) The async node style callback
*/
function render(filename, options, callback) {
  const isAsync = callback && typeof callback === 'function';

  if (!isAsync) {
    return renderSync(filename, options)
  }

  getTemplate(filename, options, function (err, template) {
    if (err) {
      return callback(err);
    }

    template.render({ model: options, }, callback);
  });
}

/**
* Renders a template sync
* @param {String} filename The path to the file
* @param {Object} options The model to pass to the view
*/
function renderSync(filename, options) {
  const template = getTemplate(filename, options);
  return template.render({ model: options, });
}


/**
* Render a template that can contain top level async/await
* @param {String} filename The path to the file
* @param {Object} options The model to pass to the view
*/
function renderAsync(filename, options) {
  return getTemplateAsync(filename, options)
    .then((template) => template.renderAsync({ model: options, }));
}

/**
* Render directly from a string
* @param {String} templateString The template string
* @param {Object} options The model to pass to the view
* @param {Function} callback (Optional) The async node style callback
*/
function renderString(templateString, options, callback) {
  const template = builtTemplateFromString(templateString, '', options);
  return template.render({ model: options, }, callback);
}

/**
* Render a template that can contain top level async/await directly from a string
* @param {String} templateString The template string
* @param {Object} options The model to pass to the view
*/
function renderStringAsync(templateString, options) {
  return builtTemplateFromStringAsync(templateString, '', options)
    .then((template) => template.renderAsync({ model: options, }));
}

/**
 * Async wrapper for Express compatibility
 * @param {String} filename The path to the file
 * @param {Object} options The model to pass to the view
 * @param {Function} callback The Express callback function
 */
function __expressAsync(filename, options, callback) {
  renderAsync(filename, options)
    .then(result => callback(null, result))
    .catch(err => callback(err));
}

module.exports = {
  __express: render,
  __expressAsync: __expressAsync,
  doT: dot,
  render: render,
  renderAsync: renderAsync,
  renderString: renderString,
  renderStringAsync: renderStringAsync,
  cache: cache,
  asyncCache: asyncCache,
  settings: settings,
  helper: DotDef.prototype,
  helperAsync: DotDefAsync.prototype
};
