angular.module('CyDirectives')
.directive('cyContextmenu', ['$parse', function($parse) {
  return {
    restrict: 'A',
    compile: function($element, attr) {
      var onContextmenu = $parse(attr['cyContextmenu']);
      return function cyContextmenuHandler(scope, element) {
        element.on('contextmenu', function(event) {
          scope.$apply(function() {
            onContextmenu(scope, {$event:event});
          });
        });
      };
    }
  };
}]);
