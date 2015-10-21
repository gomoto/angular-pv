/**
 * The scope variable passed as the directive's attribute value is set to true
 * during a 'mousedrag' on the directive's element. It is set to false when the
 * 'mousedrag' is done. 'Mousedrag' is a mousemove following a mousedown on
 * the same element. Mouseup listener is attached to window to detect mouseup
 * events outside the browser window.
 */
angular.module('CyDirectives')
.directive('cyMousedrag', ['$window', function($window) {
  return {
    restrict: 'A',
    link: function cyMousedragHandler(scope, element, attrs) {
      var mousedownFlag = false;
      var mousedragFlag = attrs.cyMousedrag;
      element.on('mousedown', function() {
        scope.$apply(function() {
          mousedownFlag = true;
        });
      });
      element.on('mousemove', function() {
        scope.$apply(function() {
          scope[mousedragFlag] = mousedownFlag;
        });
      });
      function resetMousedrag() {
        scope.$apply(function() {
          mousedownFlag = false;
          scope[mousedragFlag] = false;
        });
      }
      $window.addEventListener('mouseup', resetMousedrag);
      scope.$on('$destroy', function() {
        $window.removeEventListener('mouseup', resetMousedrag);
      });
    }
  };
}]);
