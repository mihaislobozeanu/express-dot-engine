var engine = require('../');
var mock = require('mock-fs');
var path = require('path');
var should = require('should');

var expressOptions = {};

describe('express-dot-engine', function () {

  afterEach(function () {
    mock.restore();
  });

  //////////////////////////////////////////////////////////////////////////////
  // SERVER MODEL
  //////////////////////////////////////////////////////////////////////////////
  describe('server model', function () {

    it('should have access to server model', function (done) {
      // prepare
      mock({
        'path/views': {
          'child.dot': 'test-view [[= model.test ]]',
        },
      });

      // run
      engine.__express(
        'path/views/child.dot',
        { test: 'test-model', },
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-view test-model');
          done();
        });
    });

    it('should have access to server model in a layout', function (done) {
      // prepare
      mock({
        'path/views': {
          'master.dot': 'test-master [[= model.test ]]',
          'child.dot': '---\nlayout: master.dot\n---\n',
        },
      });

      // run
      engine.__express(
        'path/views/child.dot',
        { test: 'test-model', },
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-master test-model');
          done();
        });
    });

    it('should have access to server model in a partial', function (done) {
      // prepare
      mock({
        'path/views': {
          'partial.dot': 'test-partial [[= model.test ]]',
          'child.dot': 'test-child [[=partial(\'partial.dot\')]]',
        },
      });

      // run
      engine.__express(
        'path/views/child.dot',
        { test: 'test-model', },
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-child test-partial test-model');
          done();
        });
    });

  });

  //////////////////////////////////////////////////////////////////////////////
  // LAYOUT
  //////////////////////////////////////////////////////////////////////////////
  describe('layout', function () {

    it('should support 2 levels', function (done) {
      // prepare
      mock({
        'path/views': {
          'master.dot': 'test-master [[= layout.section ]]',
          'child.dot': '---\nlayout: master.dot\n---\n[[##section:test-child#]]',
        },
      });

      // run
      engine.__express(
        'path/views/child.dot', {},
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-master test-child');
          done();
        });
    });

    it('should support 3 levels', function (done) {
      // prepare
      mock({
        'path/views': {
          'master.dot': 'test-master [[= layout.section ]]',
          'middle.dot': '---\nlayout: master.dot\n---\n[[##section:test-middle [[= layout.section ]]#]]',
          'child.dot': '---\nlayout: middle.dot\n---\n[[##section:test-child#]]',
        },
      });

      // run
      engine.__express(
        'path/views/child.dot', {},
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-master test-middle test-child');
          done();
        });
    });

  });

  //////////////////////////////////////////////////////////////////////////////
  // PARTIAL
  //////////////////////////////////////////////////////////////////////////////
  describe('partial', function () {

    it('should work', function (done) {
      // prepare
      mock({
        'path/views': {
          'partial.dot': 'test-partial',
          'child.dot': 'test-child [[=partial(\'partial.dot\')]]',
        },
      });

      // run
      engine.__express(
        'path/views/child.dot',
        { test: 'test-model', },
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-child test-partial');
          done();
        });
    });

    it('should allow to pass additional data to the partial', function (done) {
      // prepare
      mock({
        'path/views': {
          'partial.dot': 'test-partial [[=model.media]]',
          'child.dot': 'test-child [[=partial(\'partial.dot\', { media: model.test, })]]',
        },
      });

      // run
      engine.__express(
        'path/views/child.dot',
        { test: 'test-model', },
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-child test-partial test-model');
          done();
        });
    });

  });

  //////////////////////////////////////////////////////////////////////////////
  // TEMPLATE
  //////////////////////////////////////////////////////////////////////////////
  describe('render', function () {

    it('should work async', function (done) {
      // prepare
      mock({
        'path/views': {
          'child.dot': 'test-template [[= model.test ]]',
        },
      });

      // run
      engine.render(
        'path/views/child.dot',
        { test: 'test-model', },
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-template test-model');
          done();
        });
    });

    it('should work sync', function () {
      // prepare
      mock({
        'path/views': {
          'child.dot': 'test-template [[= model.test ]]',
        },
      });

      // run
      var result = engine.render(
        'path/views/child.dot',
        { test: 'test-model', });

      // result
      should(result).equal('test-template test-model');
    });

  });

  //////////////////////////////////////////////////////////////////////////////
  // TEMPLATE STRING
  //////////////////////////////////////////////////////////////////////////////
  describe('renderString', function () {

    it('should work async', function (done) {

      // run
      engine.renderString(
        'test-template [[= model.test ]]',
        { test: 'test-model', },
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-template test-model');
          done();
        });
    });

    it('should work sync', function () {

      // run
      var result = engine.renderString(
        'test-template [[= model.test ]]',
        { test: 'test-model', });

      // result
      should(result).equal('test-template test-model');
    });

  });

  //////////////////////////////////////////////////////////////////////////////
  // TEMPLATE PROVIDER
  //////////////////////////////////////////////////////////////////////////////
  describe('render with template provider', function () {

    var templatename = 'render.with.template.provider',
      template = 'test-template [[= model.test ]]',
      getTemplate = function (name, options, callback) {
        var isAsync = callback && typeof callback === 'function';
        if (name === templatename) {
          if (!isAsync) {
            return template;
          }
          callback(null, template);
        }
      };

    it('should work async', function (done) {
      // run
      engine.render(
        templatename,
        { getTemplate: getTemplate, test: 'test-model', },
        function (err, result) {
          should(err).not.be.ok;
          should(result).equal('test-template test-model');
          done();
        });
    });

    it('should work sync', function () {
      // run
      var result = engine.render(
        templatename,
        { getTemplate: getTemplate, test: 'test-model', });

      // result
      should(result).equal('test-template test-model');
    });

  });

  //////////////////////////////////////////////////////////////////////////////
  // CACHE
  //////////////////////////////////////////////////////////////////////////////
  describe('cache', function () {

    it('should work', function (done) {
      // prepare
      mock({
        'path/views': {
          'child.dot': 'test-child [[= model.test ]]',
        },
      });

      // run
      function test(data, cb) {
        engine.__express(
          'path/views/child.dot',
          {
            cache: true,
            test: data,
          },
          function (err, result) {
            should(err).not.be.ok;
            should(result).equal('test-child ' + data);
            cb();
          }
        );
      }

      test('test-model1',
        function () { test('test-model2', done); }
      );
    });

  });



  //////////////////////////////////////////////////////////////////////////////
  // TEMPLATE WITH ASYNC/AWAIT
  //////////////////////////////////////////////////////////////////////////////
  describe('templates containing top level async/await', function () {

    it('should work inside evaluate', async function () {
      // prepare
      mock({
        'path/views': {
          'child.dot': '[[async function test() {return "test done"} const value = await test();]]test-template [[= value ]]',
        },
      });

      // run
      const result = await engine.renderAsync('path/views/child.dot', {});
      // result
      should(result).equal('test-template test done');
    });

    it('should work inside interpolate', async function () {
      // prepare
      mock({
        'path/views': {
          'child.dot': '[[async function test() {return "test done"} ]]test-template [[= await test()]]',
        },
      });

      // run
      const result = await engine.renderAsync('path/views/child.dot', {});
      // result
      should(result).equal('test-template test done');
    });


    it('should work inside encode', async function () {
      // prepare
      mock({
        'path/views': {
          'child.dot': `Encoded async result: [[!await (async () => {
              await new Promise(resolve => setTimeout(resolve, 0));
              return '<script>alert("XSS")</script>';
            })()]]`,
        },
      });

      // run
      const result = await engine.renderAsync('path/views/child.dot', {});
      // result
      should(result).equal('Encoded async result: &#60;script&#62;alert(&#34;XSS&#34;)&#60;&#47;script&#62;');
    });

    it('should work inside conditional', async function () {
      // prepare
      mock({
        'path/views': {
          'child.dot':
            `[[? await (async () => {
              await new Promise(resolve => setTimeout(resolve, 0));
              return true;
            })() ]]Condition met[[??]]Condition not met[[?]]`
        },
      });

      // run
      const result = await engine.renderAsync('path/views/child.dot', {});
      // result
      should(result).equal('Condition met');
    });

    it('should work inside iterate', async function () {
      // prepare
      mock({
        'path/views': {
          'child.dot':
            `[[~ await (async () => {
              await new Promise(resolve => setTimeout(resolve, 0));
              return [1, 2, 3];
          })() :value:index]]Item [[=index]]: [[=value]][[~]]`
        },
      });

      // run
      const result = await engine.renderAsync('path/views/child.dot', {});
      // result
      should(result).equal('Item 0: 1Item 1: 2Item 2: 3');
    });

    it('should work with partials without await', async function () {
      // prepare
      mock({
        'path/views': {
          'partial1.dot': '[[=await(async () => \'third level\')()]]',
          'partial2.dot': '[[=model.media]]\n[[=partial(\'partial1.dot\')]]',
          'partial3.dot': 'first level\n[[=partial(\'partial2.dot\', {media: model.media})]]',
          'root.dot': 'test-root\n[[=partial(\'partial3.dot\', { media: model.test, })]]'
        },
      });

      // run
      const result = await engine.renderAsync('path/views/root.dot', { test: 'second level', });
      // result
      should(result).equal('test-root\nfirst level\nsecond level\nthird level');
    });

    it('should work with partials with await', async function () {
      // prepare
      mock({
        'path/views': {
          'partial1.dot': '[[=await(async () => \'third level\')()]]',
          'partial2.dot': '[[=model.media]]\n[[=await partial(\'partial1.dot\')]]',
          'partial3.dot': 'first level\n[[=await partial(\'partial2.dot\', {media: model.media})]]',
          'root.dot': 'test-root\n[[= await partial(\'partial3.dot\', { media: model.test, })]]'
        },
      });

      // run
      const result = await engine.renderAsync('path/views/root.dot', { test: 'second level', });
      // result
      should(result).equal('test-root\nfirst level\nsecond level\nthird level');
    });

    it('should support 3 levels', async function () {
      // prepare
      mock({
        'path/views': {
          'master.dot': 'test-master [[= layout.section ]]',
          'middle.dot': '---\nlayout: master.dot\n---\n[[##section:test-middle [[= layout.section ]]#]]',
          'child.dot': '---\nlayout: middle.dot\n---\n[[##section:test-child#]]',
        },
      });

      // run
      const result = await engine.renderAsync('path/views/child.dot', {});
      // result
      should(result).equal('test-master test-middle test-child');
    });

    it('should support template strings', async function () {
      // run
      const result = await engine.renderStringAsync(
        'test-template [[= model.test ]]',
        { test: 'test-model', });

      // result
      should(result).equal('test-template test-model');
    });

  });
});
