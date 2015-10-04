//Right now a chain requires a name: name is the id.
//Will there ever be two chains both without names?

//Element.classList not supported < IE9

angular.module('CyDirectives')
.directive('cySequenceViewer', ['$log', function($log) {
  /**
   * Search for a specified className on an element and its ancestors.
   * Once found, return the element. If not found, return null.
   *
   * @param {Element} element The element from which to start searching
   * @param {String} className The class name for which to search
   * @return {Element | null} The element with the className
   */
  function findElementWithClassName(element, className) {
    while (element) {
      if ( element.classList && element.classList.contains(className) ) {
        return element;
      }
      element = element.parentNode;
    }
    return null;
  }

  function hideMenus() {
    //hide all pose menus
    var poses = document.querySelectorAll('.sv-pose');
    for (var i = 0; i < poses.length; i++) {
      poses[i].classList.remove('sv-pose--with-menu');
    }
  }

  return {
    restrict: 'E',
    templateUrl: 'cy-sequence-viewer.html',
    scope: {
      poses: '&',
      picks: '=',
      selections: '=',
      hover: '=',
      anchor: '='
    },
    link: function(scope, element) {
      element.on('contextmenu', contextmenuListener);
      scope.$on('$destroy', function() {
        element.off('contextmenu', contextmenuListener);
      });
      function contextmenuListener(event) {
        //prevent default context menu anywhere in this component
        event.preventDefault();
        hideMenus();
        //if target is or is in `.sv-pose-name`, open pose name menu
        var poseNameElement = findElementWithClassName(event.target, 'sv-pose-name');
        if (poseNameElement) {
          //show menu for target pose
          var poseElement = findElementWithClassName(poseNameElement, 'sv-pose');
          poseElement.classList.add('sv-pose--with-menu');
        }
      }
    },
    controller: function($scope) {
      var chainLabelWidth = 2;

      $scope.target = null;

      function setAnchor(poseIndex, chainIndex, residueIndex) {
        /*
        if (typeof arguments[0] === 'object' &&
            _.has(arguments[0], 'rowIndex') &&
            _.has(arguments[0], 'columnIndex')) {
          anchor = arguments[0];
          return;
        }
        if (typeof residueIndex !== 'undefined') {
          anchor = transformResidue(poseIndex, chainIndex, residueIndex);
        } else if (typeof chainIndex !== 'undefined') {
          anchor = transformResidue(poseIndex, chainIndex, 0);
        } else if (typeof poseIndex !== 'undefined') {
          anchor = transformResidue(poseIndex, 0, 0);
        } else {
          anchor = transformResidue(0, 0, 0);
        }
        */
        var pose = $scope.poses[poseIndex];
        var chain = pose.chains[chainIndex];
        var residue = chain.residues[residueIndex];
        $scope.anchor = {
          pose: pose.id,
          chain: chain.name,
          residue: residue.position
        };
      }
      function setTarget(poseIndex, chainIndex, residueIndex) {
        /*
        if (typeof arguments[0] === 'object' &&
            _.has(arguments[0], 'rowIndex') &&
            _.has(arguments[0], 'columnIndex')) {
          target = arguments[0];
          return;
        }
        if (typeof residueIndex !== 'undefined') {
          target = transformResidue(poseIndex, chainIndex, residueIndex);
        } else if (typeof chainIndex !== 'undefined') {
          target = transformResidue(poseIndex, chainIndex, 0);
        } else if (typeof poseIndex !== 'undefined') {
          target = transformResidue(poseIndex, 0, 0);
        } else {
          target = transformResidue(0, 0, 0);
        }
        */
        var pose = $scope.poses[poseIndex];
        var chain = pose.chains[chainIndex];
        var residue = chain.residues[residueIndex];
        $scope.target = {
          pose: pose.id,
          chain: chain.name,
          residue: residue.position
        };
      }
      function unsetAnchor() {
        $scope.anchor = null;
      }
      function transformResidue(poseId, chainId, residueId) {
        //calculate row and column indexes
        //from pose, chain, and residue
        var columns = 0;
        var poseIndex = _.findIndex($scope.poses, {id: poseId});
        var chains = $scope.poses[poseIndex].chains;
        var chain;
        for (var chainCursor = 0; chainCursor < chains.length; chainCursor++) {
          chain = chains[chainCursor];
          if (chain.name === chainId) {
            //stop before the chain with chainId
            break;
          }
          columns += chainLabelWidth;
          columns += chain.residues.length;
        }
        columns += chainLabelWidth;
        var residues = chain.residues;
        for (var residueCursor = 0; residueCursor < residues.length; residueCursor++) {
          columns += 1;
          if (residues[residueCursor].position === residueId) {
            break;
          }
        }
        return {
          rowIndex: poseIndex,
          columnIndex: columns - 1
        };
      }

      function addSelection() {
        //pick all residues between the anchor and target
        var selection = {};
        var anchor = transformResidue($scope.anchor.pose, $scope.anchor.chain, $scope.anchor.residue);
        var target = transformResidue($scope.target.pose, $scope.target.chain, $scope.target.residue);
        var rowIndexMin = Math.min(anchor.rowIndex, target.rowIndex);
        var rowIndexMax = Math.max(anchor.rowIndex, target.rowIndex);
        var columnIndexMin = Math.min(anchor.columnIndex, target.columnIndex);
        var columnIndexMax = Math.max(anchor.columnIndex, target.columnIndex);
        for (var rowIndex = rowIndexMin; rowIndex <= rowIndexMax; rowIndex++) {
          var pose = $scope.poses[rowIndex];
          var columnCursor = 0;
          for (var chainCursor = 0; chainCursor < pose.chains.length && columnCursor <= columnIndexMax; chainCursor++) {
            var chain = pose.chains[chainCursor];
            columnCursor += chainLabelWidth;
            for (var residueCursor = 0; residueCursor < chain.residues.length && columnCursor <= columnIndexMax; residueCursor++) {
              if (columnCursor >= columnIndexMin) {
                if (typeof selection[pose.id] === 'undefined') {
                  selection[pose.id] = {};
                }
                if (typeof selection[pose.id][chain.name] === 'undefined') {
                  selection[pose.id][chain.name] = {};
                }
                var residue = chain.residues[residueCursor];
                selection[pose.id][chain.name][residue.position] = true;
              }
              columnCursor += 1;
            }
          }
        }
        $scope.selections.push(selection);
      }
      function addChainSelection(chainIndex) {
        //pick all residues in all chains between anchor and target
        //right now: anchor and target should have the same rowIndex
        var selection = {};
        var anchor = transformResidue($scope.anchor.pose, $scope.anchor.chain, $scope.anchor.residue);
        var target = transformResidue($scope.target.pose, $scope.target.chain, $scope.target.residue);
        var rowIndexMin = Math.min(anchor.rowIndex, target.rowIndex);
        var rowIndexMax = Math.max(anchor.rowIndex, target.rowIndex);
        for (var rowIndex = rowIndexMin; rowIndex <= rowIndexMax; rowIndex++) {
          var pose = $scope.poses[rowIndex];
          var chain = pose.chains[chainIndex];
          if (typeof chain === 'undefined') {
            return;
          }
          if (typeof selection[pose.id] === 'undefined') {
            selection[pose.id] = {};
          }
          if (typeof selection[pose.id][chain.name] === 'undefined') {
            selection[pose.id][chain.name] = {};
          }
          for (var residueCursor = 0; residueCursor < chain.residues.length; residueCursor++) {
            var residue = chain.residues[residueCursor];
            selection[pose.id][chain.name][residue.position] = true;
          }
        }
        $scope.selections.push(selection);
      }
      function addPoseSelection() {
        //pick all residues in all chains in poses between anchor and target
        var selection = {};
        var anchor = transformResidue($scope.anchor.pose, $scope.anchor.chain, $scope.anchor.residue);
        var target = transformResidue($scope.target.pose, $scope.target.chain, $scope.target.residue);
        var rowIndexMin = Math.min(anchor.rowIndex, target.rowIndex);
        var rowIndexMax = Math.max(anchor.rowIndex, target.rowIndex);
        for (var rowIndex = rowIndexMin; rowIndex <= rowIndexMax; rowIndex++) {
          var pose = $scope.poses[rowIndex];
          if (typeof selection[pose.id] === 'undefined') {
            selection[pose.id] = {};
          }
          for (var chainCursor = 0; chainCursor < pose.chains.length; chainCursor++) {
            var chain = pose.chains[chainCursor];
            if (typeof selection[pose.id][chain.name] === 'undefined') {
              selection[pose.id][chain.name] = {};
            }
            for (var residueCursor = 0; residueCursor < chain.residues.length; residueCursor++) {
              var residue = chain.residues[residueCursor];
              selection[pose.id][chain.name][residue.position] = true;
            }
          }
        }
        $scope.selections.push(selection);
      }
      function updatePicks() {
        $scope.picks = _.merge.apply(this, [{}].concat($scope.selections));
        $log.info($scope.picks);
      }

      //Internal scope

      //so we don't have to call poses() every time
      $scope.poses = $scope.poses();

      $scope.getColumns = function(poses) {
        var maxColumns = 0;
        poses.forEach(function(pose) {
          var columns = 0;
          pose.chains.forEach(function(chain) {
            columns += chainLabelWidth;
            columns += chain.residues.length;
          });
          columns -= chainLabelWidth;//don't count first label
          if (columns > maxColumns) {
            maxColumns = columns;
          }
        });
        return _.range(1, maxColumns + 1);
      };

      $scope.palettes = [
        {class: '', name: 'Pose color'},
        {class: 'palette-clustal', name: 'Clustal'},
        {class: 'palette-hydrophobicity', name: 'Hydrophobicity'}
      ];
      $scope.palette = $scope.palettes[0];//default
      $scope.setPalette = function(paletteIndex) {
        $scope.palette = $scope.palettes[paletteIndex];
      };

      var rulers = {};
      $scope.isPoseRulerShowing = function(poseId) {
        return !!rulers[poseId];
      };
      $scope.showPoseRuler = function(poseId) {
        rulers[poseId] = true;
        hideMenus();
      };
      $scope.hidePoseRuler = function(poseId) {
        delete rulers[poseId];
        hideMenus();
      };
      $scope.showAllPoseRulers = function() {
        rulers = {};
        $scope.poses.forEach(function(pose) {
          rulers[pose.id] = true;
        });
      };
      $scope.hideAllPoseRulers = function() {
        rulers = {};
      };


      $scope.isResiduePicked = function(poseId, chainId, residueId) {
        //Returns true if residue is one of the currently picked residues
        if (typeof $scope.picks[poseId] === 'undefined') {
          return false;
        }
        if (typeof $scope.picks[poseId][chainId] === 'undefined') {
          return false;
        }
        return !!$scope.picks[poseId][chainId][residueId];
      };

      $scope.isChainPicked = function(poseId, chainId) {
        //Returns true if any residue is picked in the chain with the given ids
        if (typeof $scope.picks[poseId] === 'undefined') {
          return false;
        }
        return typeof $scope.picks[poseId][chainId] !== 'undefined';
      };

      $scope.isPosePicked = function(poseId) {
        //Returns true if any residue is picked in the pose with the given id.
        return typeof $scope.picks[poseId] !== 'undefined';
      };

      $scope.isResidueHover = function(poseId, chainId, residueId) {
        //Returns true if residue is the hover residue
        if ($scope.hover === null) {
          return false;
        }
        return (
          $scope.hover.pose === poseId &&
          $scope.hover.chain === chainId &&
          $scope.hover.residue === residueId
        );
      };

      $scope.isResidueAnchor = function(poseId, chainId, residueId) {
        //Returns true if residue is the anchor residue
        if ($scope.anchor === null) {
          return false;
        }
        return (
          $scope.anchor.pose === poseId &&
          $scope.anchor.chain === chainId &&
          $scope.anchor.residue === residueId
        );
      };

      $scope.onResidueMousedown = function(event, poseIndex, chainIndex, residueIndex) {
        if (event.buttons !== 1) {
          //require left-click mousedown
          return;
        }
        if (event.shiftKey) {
          if ($scope.anchor === null) {
            //can't make a selection without an anchor
            return;
          }
          if (event.ctrlKey) {
            $scope.selections.pop();//replace last
          } else {
            $scope.selections.length = 0;//replace all
          }
          setTarget(poseIndex, chainIndex, residueIndex);
          addSelection();
        } else {
          if (!event.ctrlKey) {
            $scope.selections.length = 0;
          }
          //new 1x1 selection
          //set as anchor
          setAnchor(poseIndex, chainIndex, residueIndex);
          setTarget(poseIndex, chainIndex, residueIndex);
          addSelection();
        }
        updatePicks();
      };

      $scope.onResidueMouseenter = function(event, poseIndex, chainIndex, residueIndex) {
        if (event.buttons === 1) { //left-clicking
          if ($scope.anchor === null) {
            //can't make a selection without an anchor
            return;
          }
          //update last selection, based on anchor residue
          $scope.selections.pop();
          setTarget(poseIndex, chainIndex, residueIndex);
          addSelection();
          updatePicks();
        } else {
          //set hover residue
          angular.element(event.currentTarget).addClass('sv-hover');
          var pose = $scope.poses[poseIndex];
          var chain = pose.chains[chainIndex];
          var residue = chain.residues[residueIndex];
          $scope.hover = {
            pose: pose.id,
            chain: chain.name,
            residue: residue.position
          };
        }
      };

      $scope.onResidueMouseleave = function(event) {
        //unset hover residue
        angular.element(event.currentTarget).removeClass('sv-hover');
        $scope.hover = null;
      };

      $scope.onChainMousedown = function(event, poseIndex, chainIndex) {
        if (event.buttons !== 1) {
          //require left-click mousedown
          return;
        }
        if (event.shiftKey) {
          return;
        }
        if (!event.ctrlKey) {
          $scope.selections.length = 0;
        }
        //set anchor to first residue in this chain
        //new 1xN selection
        setAnchor(poseIndex, chainIndex, 0);
        setTarget(poseIndex, chainIndex, 0);
        addChainSelection(chainIndex);
        updatePicks();
      };

      $scope.onPoseMousedown = function(event, poseIndex) {
        if (event.buttons !== 1) {
          //require left-click mousedown
          return;
        }
        if (event.shiftKey) {
          if ($scope.anchor === null) {
            //can't make a selection without an anchor
            return;
          }
          if (event.ctrlKey) {
            $scope.selections.pop();//replace last
          } else {
            $scope.selections.length = 0;//replace all
          }
          setTarget(poseIndex, 0, 0);
          addPoseSelection();
        } else {
          if (!event.ctrlKey) {
            $scope.selections.length = 0;
          }
          //set anchor to first residue in first chain of this pose
          //new 1xN selection
          setAnchor(poseIndex, 0, 0);
          setTarget(poseIndex, 0, 0);
          addPoseSelection();
        }
        updatePicks();
      };

      /* $scope.poses[0] may not have a residue at columnIndex
      $scope.onColumnMousedown = function(event, columnIndex) {
        if (event.buttons !== 1) {
          //require left-click mousedown
          return;
        }
        var target = {
          rowIndex: $scope.poses.length - 1,
          columnIndex: columnIndex + chainLabelWidth
        };
        if (event.shiftKey) {
          if ($scope.anchor === null) {
            //can't make a selection without an anchor
            return;
          }
          if (event.ctrlKey) {
            $scope.selections.pop();//replace last
          } else {
            $scope.selections.length = 0;//replace all
          }
          setTarget(target);
          addSelection();
        } else {
          if (!event.ctrlKey) {
            $scope.selections.length = 0;
          }
          //set anchor to first residue in column
          //new 1xN selection
          setAnchor({
            rowIndex: 0,
            columnIndex: columnIndex + chainLabelWidth
          });
          setTarget(target);
          addSelection();
        }
        updatePicks();
      };
      */

      $scope.erasePicks = function() {
        //unset anchor residue
        unsetAnchor();
        //erase picks
        $scope.selections.length = 0;
        updatePicks();
      };

      $scope.erasePosePicks = function(poseId) {
        //erase picks for the pose
        delete $scope.picks[poseId];

        //put anchor on first available residue,
        //or remove anchor if inversion has no residues
        unsetAnchor();

        //only need to go until anchor gets set
        outerLoop:
        for (var poseCursor = 0; poseCursor < $scope.poses.length; poseCursor++) {
          var pose = $scope.poses[poseCursor];
          for (var chainCursor = 0; chainCursor < pose.chains.length; chainCursor++) {
            var chain = pose.chains[chainCursor];
            for (var residueCursor = 0; residueCursor < chain.residues.length; residueCursor++) {
              var residue = chain.residues[residueCursor];
              if ($scope.picks[pose.id] &&
                  $scope.picks[pose.id][chain.name] &&
                  $scope.picks[pose.id][chain.name][residue.position]) {
                setAnchor(poseCursor, chainCursor, residueCursor);
                break outerLoop;
              }
            }
          }
        }
        $scope.selections.length = 0;
        $scope.selections.push($scope.picks);
        updatePicks();
        hideMenus();
      };

      $scope.invertPicks = function() {
        //put anchor on first available residue,
        //or remove anchor if inversion has no residues
        unsetAnchor();

        //invert picks; put into a single selection
        var inversion = {};
        $scope.poses.forEach(function(pose, poseIndex) {
          pose.chains.forEach(function(chain, chainIndex) {
            chain.residues.forEach(function(residue, residueIndex) {
              if ($scope.picks[pose.id] &&
                  $scope.picks[pose.id][chain.name] &&
                  $scope.picks[pose.id][chain.name][residue.position]) {
                return;
              }
              //only pick non-picked residues
              if (typeof inversion[pose.id] === 'undefined') {
                inversion[pose.id] = {};
              }
              if (typeof inversion[pose.id][chain.name] === 'undefined') {
                inversion[pose.id][chain.name] = {};
              }
              inversion[pose.id][chain.name][residue.position] = true;
              //set anchor only once
              if ($scope.anchor === null) {
                setAnchor(poseIndex, chainIndex, residueIndex);
              }
            });
          });
        });
        $scope.selections.length = 0;
        $scope.selections.push(inversion);
        updatePicks();
      };

      $scope.invertPosePicks = function(poseId) {
        //put anchor on first available residue,
        //or remove anchor if inversion has no residues
        unsetAnchor();

        //invert only the specified pose; put into a single selection
        var inversion = {};
        $scope.poses.forEach(function(pose, poseIndex) {
          pose.chains.forEach(function(chain, chainIndex) {
            chain.residues.forEach(function(residue, residueIndex) {
              if ($scope.picks[pose.id] &&
                  $scope.picks[pose.id][chain.name] &&
                  $scope.picks[pose.id][chain.name][residue.position]) {
                if (poseId === pose.id) {
                  return;
                }
              } else {
                if (poseId !== pose.id) {
                  return;
                }
              }
              //only pick residues not in pose that are already picked
              //and residues in pose that are not yet picked
              if (typeof inversion[pose.id] === 'undefined') {
                inversion[pose.id] = {};
              }
              if (typeof inversion[pose.id][chain.name] === 'undefined') {
                inversion[pose.id][chain.name] = {};
              }
              inversion[pose.id][chain.name][residue.position] = true;
              //set anchor only once
              if ($scope.anchor === null) {
                setAnchor(poseIndex, chainIndex, residueIndex);
              }
            });
          });
        });
        $scope.selections.length = 0;
        $scope.selections.push(inversion);
        updatePicks();
        hideMenus();
      };

      $scope.hidePoseMenus = function(event) {
        //if event originated from within pose-menu, don't hide
        if (findElementWithClassName(event.target, 'sv-pose-menu')) {
          return;
        }
        hideMenus();
      };

      $scope.hideSequenceViewerMenu = function(event) {
        //if event originated from within sv-header, don't hide
        if (findElementWithClassName(event.target, 'sv-header')) {
          return;
        }
        var sequenceViewerMenu = event.currentTarget.querySelector('.sv-header');
        angular.element(sequenceViewerMenu).removeClass('sv-header--with-menu');
      };

      $scope.openSequenceViewerMenu = function(event) {
        event.stopPropagation();
        //close menu
        angular.element(event.currentTarget).removeClass('sv-header--with-menu');
        //if menu icon was clicked, open menu
        if (angular.element(event.target).hasClass('sv-header-icon')) {
          angular.element(event.currentTarget).addClass('sv-header--with-menu');
        }
      };

    }
  };
}]);
