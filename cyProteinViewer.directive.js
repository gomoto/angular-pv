angular.module('CyDirectives')
.directive('cyProteinViewer', function() {
  return {
    scope: {
      poses: '=',
      togglePick: '&',
      clearPicks: '&',
      hover: '='
    },
    link: function(scope, element) {

      var domElement = element[0];

      //structure object is too large to watch
      //right now, structures never deleted
      var structures = {};

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
            if (structures[newPose.pdb]) {
              viewer.renderAs(
                newPose.id,
                structures[newPose.id],
                newPose.renderMode,
                { color: pv.color.uniform(newPose.color) }
              );
              viewer.autoZoom();
            } else {
              //async
              pv.io.fetchPdb('pdb/' + newPose.pdb + '.pdb', function(structure) {
                structures[newPose.pdb] = structure;
                viewer.renderAs(
                  newPose.id,
                  structure,
                  newPose.renderMode,
                  { color: pv.color.uniform(newPose.color) }
                );
                viewer.autoZoom();
              });
            }
          } else if (newPose.color !== oldPose.color) {
            viewer.get(newPose.id).colorBy(pv.color.uniform(newPose.color));
            viewer.requestRedraw();
          } else if (!_.isEqual(newPose.picks, oldPose.picks)) {
            //update the selection of this pose's rendering
            var rendering = viewer.get(newPose.id);
            var structure = rendering.structure();
            //create empty selection (pv.mol.MolView)
            var selection = structure.createEmptyView();
            //collect picked residues
            var residues = [];
            structure.chains().forEach(function(chain) {
              var chainName = chain.name();
              if (typeof newPose.picks[chainName] === 'undefined') {
                return;
              }
              chain.residues().forEach(function(residue) {
                if (!residue.isAminoacid()) {
                  return;
                }
                var residuePosition = residue.num();
                if (typeof newPose.picks[chainName][residuePosition] === 'undefined') {
                  return;
                }
                residues.push(residue);
              });
            });
            selection.addResidues(residues);
            rendering.setSelection(selection);

            //once new selections are set, redraw
            viewer.requestRedraw();
          }
        });
        //doesn't work correctly with async fetchPdb
        //console.log('# of viewering renderings', viewer.all().length);
      }, true);

      viewer.on('click', function(picked, event) {
        scope.$apply(function() {
          if (picked === null || picked.target() === null) {
            return;
          }
          var extendSelection = event.ctrlKey;
          if (!extendSelection) {
            //clear picks of all poses
            scope.clearPicks();
          }
          var rendering = picked.object().geom;
          var atom = picked.object().atom;

          var residuePosition = atom.residue().num();
          var chainName = atom.residue().chain().name();
          var poseId = rendering.name();

          scope.togglePick({
            poseId: poseId,
            chainName: chainName,
            residuePosition: residuePosition
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
