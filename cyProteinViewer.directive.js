angular.module('CyDirectives')
.directive('cyProteinViewer', function() {
  return {
    scope: {
      poses: '=',
      picks: '=',
      selections: '=',
      pdbData: '&',
      sequences: '=',
      clearPicks: '&',
      togglePick: '&',
      hover: '=',
      anchor: '='
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

      //Sync viewer structures with scope.poses
      //Selectively add/remove poses from viewer
      scope.$watch('poses', function(newPoses, oldPoses) {
        var indexedNewPoses = _.indexBy(newPoses, 'id');
        var indexedOldPoses = _.indexBy(oldPoses, 'id');

        //exiting and updated poses
        oldPoses.forEach(function(oldPose) {
          var newPose = indexedNewPoses[oldPose.id];
          if (!newPose || newPose.renderMode !== oldPose.renderMode) {
            viewer.rm(oldPose.id);
            viewer.autoZoom();
          }
        });

        //entering and updated poses
        //right now, if/elseif/else assumes only one property changed
        newPoses.forEach(function(newPose) {
          var oldPose = indexedOldPoses[newPose.id];
          if (!oldPose || newPose.renderMode !== oldPose.renderMode) {
            //if pose changes or render mode changes
            var pdbData = scope.pdbData()[newPose.id];
            var structure = pv.io.pdb(pdbData);
            //process pdbData, if not done before
            if (!oldPose) {
              //extract chains and residues
              var chains = structure.chains().map(function(chain) {
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
              //share this with parent scope
              scope.sequences = scope.sequences.concat([{
                id: newPose.id,
                chains: chains,
                name: newPose.name,
                color: newPose.color
              }]);
            }
            //render pdb structure
            viewer.renderAs(
              newPose.id,
              structure,
              newPose.renderMode,
              { color: pv.color.uniform(newPose.color) }
            );
            viewer.autoZoom();
          } else if (newPose.color !== oldPose.color) {
            //if color changes
            viewer.get(newPose.id).colorBy(pv.color.uniform(newPose.color));
            viewer.requestRedraw();
          }
        });
        //console.log('# of viewer renderings', viewer.all().length);
      }, true);

      scope.$watch('picks', function(newPicks, oldPicks) {
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

      viewer.on('click', function(picked, event) {
        if (picked === null || picked.target() === null) {
          return;
        }
        var extendSelection = event.ctrlKey;
        if (!extendSelection) {
          scope.clearPicks();
        }
        var rendering = picked.object().geom;
        var atom = picked.object().atom;

        var residuePosition = atom.residue().num();
        var chainName = atom.residue().chain().name();
        var poseId = rendering.name();

        scope.$apply(function() {
          scope.togglePick({
            poseId: poseId,
            chainName: chainName,
            residuePosition: residuePosition
          });
        });

        //for now, bundle picks into a single selection
        //need to $apply scope.picks before reading it
        scope.$apply(function() {
          scope.selections.length = 0;
          scope.selections.push(scope.picks);
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
