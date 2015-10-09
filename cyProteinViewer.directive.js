angular.module('CyDirectives')
.directive('cyProteinViewer', function() {
  return {
    scope: {
      pdbData: '=',
      colors: '=',
      renderModes: '=',
      picks: '=',
      poses: '=',
      sequences: '=',
      hover: '=',
      onSelectResidue: '&',
      onUnselectAll: '&'
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

      //When poses change (pdbData changes), sync viewer renderings
      scope.$watch('pdbData', function(newPdbData, oldPdbData) {
        //remove old poses from viewer
        var exiting = _.difference( _.keys(oldPdbData), _.keys(newPdbData) );
        _.forEach(exiting, function(poseId) {
          viewer.rm(poseId);
          //viewer.autoZoom doesn't redraw if viewer has no renderings
          viewer.requestRedraw();
        });

        //render new poses in viewer
        var entering = _.difference( _.keys(newPdbData), _.keys(oldPdbData) );
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
        //Loop over oldRenderModes so that during first load of a pose,
        //viewer doesn't try to get a nonexistent rendering.
        //Otherwise old and new should have the same keys (pose IDs).
        _.forEach(oldRenderModes, function(renderMode, poseId) {
          if (renderMode === newRenderModes[poseId]) return;//render mode didn't change
          //Reuse structure
          var rendering = viewer.get(poseId);
          if (rendering === null) return;//pose with poseId was removed
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

      //When a pose changes its color, recolor rendering
      scope.$watch('colors', function(newColors, oldColors) {
        //Loop over oldColors so that during first load of a pose,
        //viewer doesn't try to get a nonexistent rendering.
        //Otherwise old and new should have the same keys (pose IDs).
        _.forEach(oldColors, function(color, poseId) {
          if (color === newColors[poseId]) return;//color didn't change
          var rendering = viewer.get(poseId);
          if (rendering === null) return;//pose with poseId was removed
          rendering.colorBy( pv.color.uniform(color) );
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
        var atom = structure
        .chain(residue.chain)
        .residueByRnum(residue.residue)
        .atom('CA');//pv.mol.Atom instance
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
});
