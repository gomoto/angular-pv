var residueCodeMap = {
  ALA: 'A',
  CYS: 'C',
  ASP: 'D',
  GLU: 'E',
  PHE: 'F',
  GLY: 'G',
  HIS: 'H',
  ILE: 'I',
  LYS: 'K',
  LEU: 'L',
  MET: 'M',
  ASN: 'N',
  PRO: 'P',
  GLN: 'Q',
  ARG: 'R',
  SER: 'S',
  THR: 'T',
  VAL: 'V',
  TRP: 'W',
  TYR: 'Y'
};

angular.module('CyDirectives')
.directive('cyProteinViewer', ['pv', function(pv) {
  return {
    restrict: 'E',
    scope: {
      poses: '=',
      picks: '=',
      sequences: '=',
      pdbData: '=',
      colors: '=',
      colorSchemes: '=',
      renderModes: '=',
      hover: '=',
      onSelectResidue: '&',
      onUnselectAll: '&',
      palettes: '='
    },
    link: function(scope, element) {

      var domElement = element[0];

      var viewer = pv.Viewer(domElement, {
        width: 'auto',
        height: 'auto',
        antialias: true,
        quality : 'high',
        background: '#2d2f32',
        selectionColor: '#fdfdfd',
        atomDoubleClicked: function(picked, event) { return false; },
        fov: 30,
        outline: true,//default true
        outlineColor: '#222',
        outlineWidth: 2
      });

      //shouldn't need to wait for viewerReady event because
      //DOM is ready by the time this post-link function runs

      //draw canvas background right away
      viewer.requestRedraw();

      //resize viewer
      window.addEventListener('resize', function() {
        viewer.fitParent();//eventually calls requestRedraw()
      });

      //When poses change, sync viewer renderings
      scope.$watch('poses', function(newPoses, oldPoses) {
        //remove old poses from viewer
        var exiting = _.difference( oldPoses, newPoses );
        _.forEach(exiting, function(poseId) {
          viewer.rm(poseId);
          //viewer.autoZoom doesn't redraw if viewer has no renderings
          viewer.requestRedraw();
        });

        //render new poses in viewer
        var entering = _.difference( newPoses, oldPoses );
        _.forEach(entering, function(poseId) {
          var structure = pv.io.pdb( scope.pdbData[poseId] );

          //extract sequence information and share with parent scope
          scope.sequences[poseId].chains = structure.chains().map(function(chain) {
            var residues = [];
            chain.residues().forEach(function(residue) {
              if (residue.isAminoacid()) {
                residues.push({
                  position: residue.num(),
                  code: residueCodeMap[residue.name()]
                });
              }
            });
            return {
              name: chain.name(),
              residues: residues
            };
          });

          viewer.renderAs(
            poseId,
            structure,
            scope.renderModes[poseId],
            { color: pv.color.uniform( scope.colors[poseId] ) }
          );
        });

        viewer.autoZoom();

        //console.log('# of viewer renderings', viewer.all().length);
      }, true);

      //When a pose changes its render mode, re-render
      scope.$watch('renderModes', function(newRenderModes, oldRenderModes) {
        //Most of the time, old and new should have the same keys (pose IDs).
        //When a pose is removed, the pose ID will be in old but not in new;
        //when a pose is added, the pose ID will be in new but not in old;
        //in both cases, viewer will not have a rendering for that pose ID.
        _.forEach(oldRenderModes, function(renderMode, poseId) {
          if (renderMode === newRenderModes[poseId]) return;//render mode didn't change
          //Reuse structure
          var rendering = viewer.get(poseId);
          if (rendering === null) return;//nonexistent rendering
          var structure = rendering.structure();
          viewer.rm(poseId);
          viewer.renderAs(
            poseId,
            structure,
            renderMode,
            { color: pv.color.uniform( scope.colors[poseId] ) }
          );
          viewer.requestRedraw();
        });
      }, true);

      //When a pose changes its color scheme, recolor rendering
      scope.$watch('colorSchemes', function(newColorSchemes, oldColorSchemes) {
        //Most of the time, old and new should have the same keys (pose IDs).
        //When a pose is removed, the pose ID will be in old but not in new;
        //when a pose is added, the pose ID will be in new but not in old;
        //in both cases, viewer will not have a rendering for that pose ID.
        _.forEach(oldColorSchemes, function(colorScheme, poseId) {
          if (colorScheme === newColorSchemes[poseId]) return;//color scheme didn't change
          var rendering = viewer.get(poseId);
          if (rendering === null) return;//nonexistent rendering

          var newColorScheme = newColorSchemes[poseId];

          if (newColorScheme === 'pose') {
            //color by default pose color
            var poseColor = scope.colors[poseId];
            rendering.colorBy( pv.color.uniform(poseColor) );
          } else {
            //color by palette
            var newPalette = scope.palettes[newColorScheme];
            var colorByAA = new pv.color.ColorOp(
              function(atom, out, index) {
                var residue = atom.residue();
                if (!residue.isAminoacid()) return;
                var hexColor = newPalette[residueCodeMap[residue.name()]];
                var color = pv.color.hex2rgb(hexColor);
                if (color === undefined) {
                  color = [0.5, 0.5, 0.5, 1.0];
                }
                out[index + 0] = color[0];
                out[index + 1] = color[1];
                out[index + 2] = color[2];
                out[index + 3] = color[3];
              }
            );
            rendering.colorBy( colorByAA );
          }

          viewer.requestRedraw();
        });
      }, true);

      scope.$watch('picks', function(newPicks, oldPicks) {
        console.log(scope.picks);

        var toBeRemoved = _.difference(_.keys(oldPicks), _.keys(newPicks));
        var toBeUpdated = _.keys(newPicks);

        toBeRemoved.forEach(function(poseId) {
          var rendering = viewer.get(poseId);
          if (rendering === null) {
            //don't need to clear rendering selection if rendering was removed
            return;
          }
          //create empty selection (pv.mol.MolView)
          var selection = rendering.structure().createEmptyView();
          rendering.setSelection(selection);
        });

        toBeUpdated.forEach(function(poseId) {
          if (_.isEqual(newPicks[poseId], oldPicks[poseId])) {
            //no change in this pose's picks
            return;
          }
          //update the selection of this pose's rendering
          var rendering = viewer.get(poseId);
          var structure = rendering.structure();
          //create empty selection (pv.mol.MolView)
          var selection = structure.createEmptyView();
          //collect picked residues
          var residues = [];
          structure.chains().forEach(function(chain) {
            var chainName = chain.name();
            if (typeof newPicks[poseId][chainName] === 'undefined') {
              return;
            }
            chain.residues().forEach(function(residue) {
              if (!residue.isAminoacid()) {
                return;
              }
              var residuePosition = residue.num();
              if (typeof newPicks[poseId][chainName][residuePosition] === 'undefined') {
                return;
              }
              residues.push(residue);
            });
          });
          selection.addResidues(residues);
          rendering.setSelection(selection);
        });

        viewer.requestRedraw();

      }, true);

      function pickResidues(anchor, target) {
        //pick all residues between the anchor and target
        var selection = {};
        if (anchor.pose !== target.pose) {
          //selection between poses does not make sense here
          return selection;
        }
        var poseId = scope.poses[target.pose];
        var sequence = scope.sequences[poseId];
        var chainIndexMin = Math.min(anchor.chain, target.chain);
        var chainIndexMax = Math.max(anchor.chain, target.chain);
        var residueIndexMin = Math.min(anchor.residue, target.residue);
        var residueIndexMax = Math.max(anchor.residue, target.residue);
        for (var chainCursor = chainIndexMin; chainCursor <= chainIndexMax; chainCursor++) {
          var chain = sequence.chains[chainCursor];
          var residueCursorMin = chainCursor === chainIndexMin ? residueIndexMin : 0;
          var residueCursorMax = chainCursor === chainIndexMax ? residueIndexMax : chain.residues.length - 1;
          for (var residueCursor = residueCursorMin; residueCursor <= residueCursorMax; residueCursor++) {
            var residue = chain.residues[residueCursor];
            //add residue to selection
            if (typeof selection[poseId] === 'undefined') {
              selection[poseId] = {};
            }
            if (typeof selection[poseId][chain.name] === 'undefined') {
              selection[poseId][chain.name] = {};
            }
            selection[poseId][chain.name][residue.position] = true;
          }
        }
        return selection;
      }

      viewer.on('click', function(picked, event) {
        scope.$apply(function() {
          if (picked === null) {
            //Clicking on background erases all picks
            //unless control key or shift key is down.
            //This prevents the selection from clearing
            //while user is trying to extend it.
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
              scope.onUnselectAll(event);
            }
            return;
          }

          var rendering = picked.object().geom;
          var atom = picked.object().atom;

          var residuePosition = atom.residue().num();
          var chainName = atom.residue().chain().name();
          var poseId = rendering.name();

          //find indexes
          var poseIndex = _.indexOf(scope.poses, poseId);
          var chainIndex = _.findIndex(scope.sequences[poseId].chains, {name: chainName});
          var residueIndex = _.findIndex(scope.sequences[poseId].chains[chainIndex].residues, {position: residuePosition});

          scope.onSelectResidue({
            event: event,
            poseIndex: poseIndex,
            chainIndex: chainIndex,
            residueIndex: residueIndex,
            pickResidues: pickResidues
          });
        });
      });

      //Don't wrap entire listener in $apply;
      //that would trigger a $digest on every mousemove.
      domElement.addEventListener('mousemove', function(event) {
        var rect = viewer.boundingClientRect();
        //get atom under cursor
        var picked = viewer.pick({
          x : event.clientX - rect.left,
          y : event.clientY - rect.top
        });
        if (picked === null) {
          if (scope.hover === null) {
            //if already no atom picked, do nothing
            return;
          }
          scope.$apply(function() {
            scope.hover = null;
          });
        } else {
          var rendering = picked.object().geom;
          var atom = picked.object().atom;

          var residuePosition = atom.residue().num();
          var chainName = atom.residue().chain().name();
          var poseId = rendering.name();

          if (
            scope.hover !== null &&
            scope.hover.residue === residuePosition &&
            scope.hover.chain === chainName &&
            scope.hover.pose === poseId
          ) {
            //if same atom picked, do nothing
            return;
          }
          scope.$apply(function() {
            scope.hover = {
              residue: residuePosition,
              chain: chainName,
              pose: poseId
            };
          });
        }
      });

      var hoverColor = '#222';//make this customizable?
      var oldColor = [0,0,0,0];//pv needs to save color in an array
      function colorResidue(residue, color, saveOldColor) {
        var rendering = viewer.get(residue.pose);
        if (rendering === null) {
          //don't need to recolor rendering if rendering was removed
          return;
        }
        var structure = rendering.structure();
        var selection = structure.createEmptyView();
        var coloredResidue = structure.chain(residue.chain).residueByRnum(residue.residue);
        var atom;
        if (coloredResidue.isAminoacid()) {
          atom = coloredResidue.atom('CA');//pv.mol.Atom instance
        } else {
          atom = coloredResidue.atom('P');
          if (!atom) return; //not amino acid or nucleotide
        }
        selection.addAtom(atom);
        if (saveOldColor) {
          rendering.getColorForAtom(atom, oldColor);
        }
        rendering.colorBy(pv.color.uniform(color), selection);
      }
      scope.$watch('hover', function(newHover, oldHover) {
        if (oldHover !== null) {
          colorResidue(oldHover, oldColor);
        }
        if (newHover !== null) {
          colorResidue(newHover, hoverColor, true);
        }
        viewer.requestRedraw();
      }, true);

    }
  };
}]);
