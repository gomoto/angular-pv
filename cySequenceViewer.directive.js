//Right now a chain requires a name: name is the id.
//Will there ever be two chains both without names?

//Element.classList not supported < IE9

angular.module('CyDirectives')
.directive('cySequenceViewer', ['$document', function($document) {
  return {
    restrict: 'E',
    templateUrl: 'cy-sequence-viewer.html',
    scope: {
      poses: '=sequences',
      picks: '=',//make this read-only? passed &-methods not working as expected
      hover: '=',
      isResidueAnchor: '&',
      onSelectResidue: '&',
      onExtendSelection: '&',
      onSelectChain: '&',
      onSelectPose: '&',
      onUnselectPose: '&',
      onInvertPose: '&',
      onInvertAll: '&'
    },
    link: function(scope, element) {
      var domElement = element[0];
      var chainLabelWidth = 2;

      element.on('contextmenu', contextmenuListener);
      $document.on('mousedown', hidePoseMenus);
      $document.on('mousedown', hideSequenceViewerMenu);
      scope.$on('$destroy', function() {
        element.off('contextmenu', contextmenuListener);
        $document.off('mousedown', hidePoseMenus);
        $document.off('mousedown', hideSequenceViewerMenu);
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
      function hidePoseMenus(event) {
        //if event originated from within pose-menu, don't hide
        if (findElementWithClassName(event.target, 'sv-pose-menu')) {
          return;
        }
        hideMenus();
      }
      function hideSequenceViewerMenu (event) {
        //if event originated from within sv-header, don't hide
        if (findElementWithClassName(event.target, 'sv-header')) {
          return;
        }
        var sequenceViewerMenu = event.currentTarget.querySelector('.sv-header');
        angular.element(sequenceViewerMenu).removeClass('sv-header--with-menu');
      }
      function hideMenus() {
        //hide all pose menus
        var poses = domElement.querySelectorAll('.sv-pose');
        for (var i = 0; i < poses.length; i++) {
          poses[i].classList.remove('sv-pose--with-menu');
        }
      }

      scope.openSequenceViewerMenu = function(event) {
        event.stopPropagation();
        //close menu
        angular.element(event.currentTarget).removeClass('sv-header--with-menu');
        //if menu icon was clicked, open menu
        if (angular.element(event.target).hasClass('sv-header-icon')) {
          angular.element(event.currentTarget).addClass('sv-header--with-menu');
        }
      };

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

      function transformIndexes(poseIndex, chainIndex, residueIndex) {
        //calculate row and column indexes from pose, chain, and residue indexes
        //count columns; one per residue plus one or more per chain label
        var columns = 0;
        var chains = scope.poses[poseIndex].chains;
        //stop before the chain at chainIndex
        for (var chainCursor = 0; chainCursor < chainIndex; chainCursor++) {
          chain = chains[chainCursor];
          columns += chainLabelWidth;
          columns += chain.residues.length;
        }
        columns += chainLabelWidth;
        for (var residueCursor = 0; residueCursor <= residueIndex; residueCursor++) {
          columns += 1;
        }
        return {
          rowIndex: poseIndex,
          columnIndex: columns - 1
        };
      }

      function pickResidues(anchor, target) {
        //pick all residues between the anchor and target
        var selection = {};
        var transforedAnchor = transformIndexes(anchor.pose, anchor.chain, anchor.residue);
        var transformedTarget = transformIndexes(target.pose, target.chain, target.residue);
        var rowIndexMin = Math.min(transforedAnchor.rowIndex, transformedTarget.rowIndex);
        var rowIndexMax = Math.max(transforedAnchor.rowIndex, transformedTarget.rowIndex);
        var columnIndexMin = Math.min(transforedAnchor.columnIndex, transformedTarget.columnIndex);
        var columnIndexMax = Math.max(transforedAnchor.columnIndex, transformedTarget.columnIndex);
        for (var rowIndex = rowIndexMin; rowIndex <= rowIndexMax; rowIndex++) {
          var pose = scope.poses[rowIndex];
          var columnCursor = 0;
          for (var chainCursor = 0; chainCursor < pose.chains.length && columnCursor <= columnIndexMax; chainCursor++) {
            var chain = pose.chains[chainCursor];
            columnCursor += chainLabelWidth;
            for (var residueCursor = 0; residueCursor < chain.residues.length && columnCursor <= columnIndexMax; residueCursor++) {
              if (columnCursor >= columnIndexMin) {
                //add residue to selection
                var residue = chain.residues[residueCursor];
                if (typeof selection[pose.id] === 'undefined') {
                  selection[pose.id] = {};
                }
                if (typeof selection[pose.id][chain.name] === 'undefined') {
                  selection[pose.id][chain.name] = {};
                }
                selection[pose.id][chain.name][residue.position] = true;
              }
              columnCursor += 1;
            }
          }
        }
        return selection;
      }

      function pickChains(anchor, target) {
        //pick all residues in the anchor chain
        var selection = {};
        var pose = scope.poses[anchor.pose];
        var chain = pose.chains[anchor.chain];
        chain.residues.forEach(function(residue) {
          //add all residues to selection
          if (typeof selection[pose.id] === 'undefined') {
            selection[pose.id] = {};
          }
          if (typeof selection[pose.id][chain.name] === 'undefined') {
            selection[pose.id][chain.name] = {};
          }
          selection[pose.id][chain.name][residue.position] = true;
        });
        return selection;
      }

      function pickPoses(anchor, target) {
        //pick all residues in all chains in poses between anchor and target
        var selection = {};
        var poseIndexMin = Math.min(anchor.pose, target.pose);
        var poseIndexMax = Math.max(anchor.pose, target.pose);
        for (var poseCursor = poseIndexMin; poseCursor <= poseIndexMax; poseCursor++) {
          var pose = scope.poses[poseCursor];
          pose.chains.forEach(function(chain) {
            chain.residues.forEach(function(residue) {
              //add all residues to selection
              if (typeof selection[pose.id] === 'undefined') {
                selection[pose.id] = {};
              }
              if (typeof selection[pose.id][chain.name] === 'undefined') {
                selection[pose.id][chain.name] = {};
              }
              selection[pose.id][chain.name][residue.position] = true;
            });
          });
        }
        return selection;
      }

      scope.getColumns = function(poses) {
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

      scope.palettes = [
        {class: '', name: 'Pose color'},
        {class: 'palette-clustal', name: 'Clustal'},
        {class: 'palette-hydrophobicity', name: 'Hydrophobicity'}
      ];
      scope.palette = scope.palettes[0];//default
      scope.setPalette = function(paletteIndex) {
        scope.palette = scope.palettes[paletteIndex];
      };

      var rulers = {};
      scope.isPoseRulerShowing = function(poseId) {
        return !!rulers[poseId];
      };
      scope.showPoseRuler = function(poseId) {
        rulers[poseId] = true;
        hideMenus();
      };
      scope.hidePoseRuler = function(poseId) {
        delete rulers[poseId];
        hideMenus();
      };
      scope.showAllPoseRulers = function() {
        rulers = {};
        scope.poses.forEach(function(pose) {
          rulers[pose.id] = true;
        });
      };
      scope.hideAllPoseRulers = function() {
        rulers = {};
      };

      scope.isResiduePicked = function(poseId, chainId, residueId) {
        //Returns true if residue is one of the currently picked residues
        if (typeof scope.picks[poseId] === 'undefined') {
          return false;
        }
        if (typeof scope.picks[poseId][chainId] === 'undefined') {
          return false;
        }
        return !!scope.picks[poseId][chainId][residueId];
      };

      scope.isChainPicked = function(poseId, chainId) {
        //Returns true if any residue is picked in the chain with the given ids
        if (typeof scope.picks[poseId] === 'undefined') {
          return false;
        }
        return typeof scope.picks[poseId][chainId] !== 'undefined';
      };

      scope.isPosePicked = function(poseId) {
        //Returns true if any residue is picked in the pose with the given id.
        return typeof scope.picks[poseId] !== 'undefined';
      };

      scope.isResidueHover = function(poseId, chainId, residueId) {
        //Returns true if residue is the hover residue
        if (scope.hover === null) {
          return false;
        }
        return (
          scope.hover.pose === poseId &&
          scope.hover.chain === chainId &&
          scope.hover.residue === residueId
        );
      };

      scope.onResidueMousedown = function(event, poseIndex, chainIndex, residueIndex) {
        if (event.buttons !== 1) {
          //require left-click mousedown
          return;
        }
        scope.onSelectResidue({
          event: event,
          poseIndex: poseIndex,
          chainIndex: chainIndex,
          residueIndex: residueIndex,
          pickResidues: pickResidues
        });
      };

      scope.onResidueMouseenter = function(event, poseIndex, chainIndex, residueIndex) {
        if (event.buttons === 1) { //left-clicking
          scope.onExtendSelection({
            event: event,
            poseIndex: poseIndex,
            chainIndex: chainIndex,
            residueIndex: residueIndex,
            pickResidues: pickResidues
          });
        } else {
          //set hover residue
          angular.element(event.currentTarget).addClass('sv-hover');
          var pose = scope.poses[poseIndex];
          var chain = pose.chains[chainIndex];
          var residue = chain.residues[residueIndex];
          scope.hover = {
            pose: pose.id,
            chain: chain.name,
            residue: residue.position
          };
        }
      };

      scope.onResidueMouseleave = function(event) {
        //unset hover residue
        angular.element(event.currentTarget).removeClass('sv-hover');
        scope.hover = null;
      };

      scope.onChainMousedown = function(event, poseIndex, chainIndex) {
        if (event.buttons !== 1) {
          //require left-click mousedown
          return;
        }
        scope.onSelectChain({
          event: event,
          poseIndex: poseIndex,
          chainIndex: chainIndex,
          pickChains: pickChains
        });
      };

      scope.onPoseMousedown = function(event, poseIndex) {
        if (event.buttons !== 1) {
          //require left-click mousedown
          return;
        }
        scope.onSelectPose({
          event: event,
          poseIndex: poseIndex,
          pickPoses: pickPoses
        });
      };

      /* scope.poses[0] may not have a residue at columnIndex
      scope.onColumnMousedown = function(event, columnIndex) {
        if (event.buttons !== 1) {
          //require left-click mousedown
          return;
        }
        var target = {
          rowIndex: scope.poses.length - 1,
          columnIndex: columnIndex + chainLabelWidth
        };
        if (event.shiftKey) {
          if (scope.anchor === null) {
            //can't make a selection without an anchor
            return;
          }
          if (!event.ctrlKey) {
            scope.frozenPicks = {};//replace all
          } //else replace last
          setTarget(target);
          scope.fluidPicks = pickResidues();
        } else {
          if (event.ctrlKey) {
            scope.frozenPicks = freezePicks();
          } else {
            scope.frozenPicks = {};//replace all
          }
          //set anchor to first residue in column
          //new 1xN selection
          setAnchor({
            rowIndex: 0,
            columnIndex: columnIndex + chainLabelWidth
          });
          setTarget(target);
          scope.fluidPicks = pickResidues();
        }
        scope.picks = freezePicks();
      };
      */

      scope.erasePosePicks = function(poseIndex) {
        scope.onUnselectPose({
          event: event,
          poseIndex: poseIndex
        });
        hideMenus();
      };

      scope.invertPosePicks = function(poseIndex) {
        scope.onInvertPose({
          event: event,
          poseIndex: poseIndex
        });
        hideMenus();
      };

      scope.invertPicks = function() {
        scope.onInvertAll({
          event: event
        });
      };

    }
  };
}]);
