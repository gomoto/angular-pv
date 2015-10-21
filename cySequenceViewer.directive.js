//Right now a chain requires a name: name is the id.
//Will there ever be two chains both without names?

angular.module('CyDirectives')
.directive('cySequenceViewer', ['$document', 'pvSelectionModes', 'RENDER_MODES', function($document, pvSelectionModes, RENDER_MODES) {
  return {
    restrict: 'E',
    templateUrl: 'cy-sequence-viewer.html',
    scope: {
      poses: '=',
      onRemovePose: '&',
      picks: '=',//make this read-only? passed &-methods not working as expected
      sequences: '=',
      displayNames: '=',
      colors: '=',
      colorSchemes: '=',
      renderModes: '=',
      hover: '=',
      isResidueAnchor: '&',
      selectionMode: '@',
      onSelectResidue: '&',
      onExtendSelection: '&',
      onSelectChain: '&',
      onSelectPose: '&',
      onUnselectPose: '&',
      onInvertPose: '&',
      onInvertAll: '&',
      palettes: '='
    },
    link: function(scope) {
      //put this as an angular constant?
      var chainLabelWidth = 2;

      scope.RENDER_MODES = RENDER_MODES;

      //track open menus
      scope.poseMenus = {};
      scope.isSequenceViewerMenuOpen = false;

      function onClosePoseMenus() {
        scope.$apply(function() {
          scope.poseMenus = {};
        });
      }

      function onCloseSequenceViewerMenu(event) {
        scope.$apply(function() {
          scope.isSequenceViewerMenuOpen = false;
        });
      }

      $document.on('mousedown', onClosePoseMenus);
      $document.on('mousedown', onCloseSequenceViewerMenu);
      scope.$on('$destroy', function() {
        $document.off('mousedown', onClosePoseMenus);
        $document.off('mousedown', onCloseSequenceViewerMenu);
      });

      scope.openPoseMenu = function(event, poseId) {
        event.preventDefault();
        //close all other pose menus
        scope.poseMenus = {};
        scope.poseMenus[poseId] = true;
      };

      scope.hidePoseMenu = function(poseId) {
        delete scope.poseMenus[poseId];
      };

      function transformIndexes(poseIndex, chainIndex, residueIndex) {
        //calculate row and column indexes from pose, chain, and residue indexes
        //count columns; one per residue plus one or more per chain label
        var columns = 0;
        var poseId = scope.poses[poseIndex];
        var sequence = scope.sequences[poseId];
        //stop before the chain at chainIndex
        for (var chainCursor = 0; chainCursor < chainIndex; chainCursor++) {
          var chain = sequence.chains[chainCursor];
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
          var poseId = scope.poses[rowIndex];
          var sequence = scope.sequences[poseId];
          var columnCursor = 0;
          for (var chainCursor = 0; chainCursor < sequence.chains.length && columnCursor <= columnIndexMax; chainCursor++) {
            var chain = sequence.chains[chainCursor];
            columnCursor += chainLabelWidth;
            for (var residueCursor = 0; residueCursor < chain.residues.length && columnCursor <= columnIndexMax; residueCursor++) {
              if (columnCursor >= columnIndexMin) {
                //add residue to selection
                var residue = chain.residues[residueCursor];
                if (typeof selection[poseId] === 'undefined') {
                  selection[poseId] = {};
                }
                if (typeof selection[poseId][chain.name] === 'undefined') {
                  selection[poseId][chain.name] = {};
                }
                selection[poseId][chain.name][residue.position] = true;
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
        var poseId = scope.poses[anchor.pose];
        var sequence = scope.sequences[poseId];
        var chain = sequence.chains[anchor.chain];
        chain.residues.forEach(function(residue) {
          //add all residues to selection
          if (typeof selection[poseId] === 'undefined') {
            selection[poseId] = {};
          }
          if (typeof selection[poseId][chain.name] === 'undefined') {
            selection[poseId][chain.name] = {};
          }
          selection[poseId][chain.name][residue.position] = true;
        });
        return selection;
      }

      function pickPoses(anchor, target) {
        //pick all residues in all chains in poses between anchor and target
        var selection = {};
        var poseIndexMin = Math.min(anchor.pose, target.pose);
        var poseIndexMax = Math.max(anchor.pose, target.pose);
        for (var poseCursor = poseIndexMin; poseCursor <= poseIndexMax; poseCursor++) {
          var poseId = scope.poses[poseCursor];
          var sequence = scope.sequences[poseId];
          sequence.chains.forEach(function(chain) {
            chain.residues.forEach(function(residue) {
              //add all residues to selection
              if (typeof selection[poseId] === 'undefined') {
                selection[poseId] = {};
              }
              if (typeof selection[poseId][chain.name] === 'undefined') {
                selection[poseId][chain.name] = {};
              }
              selection[poseId][chain.name][residue.position] = true;
            });
          });
        }
        return selection;
      }

      scope.getColumns = function(poses) {
        var maxColumns = 0;
        poses.forEach(function(poseId) {
          var columns = 0;
          var sequence = scope.sequences[poseId];
          sequence.chains.forEach(function(chain) {
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

      var rulers = {};
      scope.isPoseRulerShowing = function(poseId) {
        return !!rulers[poseId];
      };
      scope.showPoseRuler = function(poseId) {
        rulers[poseId] = true;
      };
      scope.hidePoseRuler = function(poseId) {
        delete rulers[poseId];
      };
      scope.showAllPoseRulers = function() {
        rulers = {};
        scope.poses.forEach(function(poseId) {
          rulers[poseId] = true;
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

      scope.getResidueColor = function(poseId, residueCode) {
        var residueColor;
        if (scope.colorSchemes[poseId] === 'pose') {
          //color by default pose color
          residueColor = scope.colors[poseId];
        } else {
          //color by palette
          residueColor = scope.palettes[scope.colorSchemes[poseId]][residueCode];
        }
        return residueColor;
      };

      scope.onResidueMousedown = function(event, poseIndex, chainIndex, residueIndex) {
        if (scope.selectionMode === pvSelectionModes.molecule) {
          scope.onSelectPose({
            event: event,
            poseIndex: poseIndex,
            pickPoses: pickPoses
          });
        } else if (scope.selectionMode === pvSelectionModes.chain) {
          scope.onSelectChain({
            event: event,
            poseIndex: poseIndex,
            chainIndex: chainIndex,
            pickChains: pickChains
          });
        } else {
          scope.onSelectResidue({
            event: event,
            poseIndex: poseIndex,
            chainIndex: chainIndex,
            residueIndex: residueIndex,
            pickResidues: pickResidues
          });
        }
      };

      scope.onResidueMouseenter = function(event, poseIndex, chainIndex, residueIndex) {
        if (event.buttons === 1 || event.which === 1) { //left-clicking
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
          var poseId = scope.poses[poseIndex];
          var sequence = scope.sequences[poseId];
          var chain = sequence.chains[chainIndex];
          var residue = chain.residues[residueIndex];
          scope.hover = {
            pose: poseId,
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
        scope.onSelectChain({
          event: event,
          poseIndex: poseIndex,
          chainIndex: chainIndex,
          pickChains: pickChains
        });
      };

      scope.onPoseMousedown = function(event, poseIndex) {
        //do nothing if trying to open context menu
        var rightClick = event.buttons === 2 || event.which === 3;
        var ctrlClick = event.ctrlKey || event.metaKey;
        if (rightClick || ctrlClick) {
          return;
        }
        scope.onSelectPose({
          event: event,
          poseIndex: poseIndex,
          pickPoses: pickPoses
        });
      };

      scope.erasePosePicks = function(poseIndex) {
        scope.onUnselectPose({
          event: event,
          poseIndex: poseIndex
        });
      };

      scope.invertPosePicks = function(poseIndex) {
        scope.onInvertPose({
          event: event,
          poseIndex: poseIndex
        });
      };

      scope.invertPicks = function() {
        scope.onInvertAll({
          event: event
        });
      };

    }
  };
}]);
