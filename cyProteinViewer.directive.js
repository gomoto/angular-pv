angular.module('CyDirectives')
.directive('cyProteinViewer', function() {
  return {
    scope: {
      poses: '=',
      picks: '=',
      frozenPicks: '=',
      fluidPicks: '=',
      pdbData: '&',
      sequences: '=',
      //togglePick: '&',
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

      scope.target = null;
      function setAnchor(poseIndex, chainIndex, residueIndex) {
        scope.anchor = {
          pose: poseIndex,
          chain: chainIndex,
          residue: residueIndex
        };
      }
      function setTarget(poseIndex, chainIndex, residueIndex) {
        scope.target = {
          pose: poseIndex,
          chain: chainIndex,
          residue: residueIndex
        };
      }
      function makeSelection() {
        //pick all residues between the anchor and target
        var selection = {};
        if (scope.anchor.pose !== scope.target.pose) {
          //selection between poses does not make sense here
          return selection;
        }
        var pose = scope.sequences[scope.target.pose];
        var chainIndexMin = Math.min(scope.anchor.chain, scope.target.chain);
        var chainIndexMax = Math.max(scope.anchor.chain, scope.target.chain);
        var residueIndexMin = Math.min(scope.anchor.residue, scope.target.residue);
        var residueIndexMax = Math.max(scope.anchor.residue, scope.target.residue);
        for (var chainCursor = chainIndexMin; chainCursor <= chainIndexMax; chainCursor++) {
          var chain = pose.chains[chainCursor];
          for (var residueCursor = residueIndexMin; residueCursor <= residueIndexMax; residueCursor++) {
            var residue = chain.residues[residueCursor];
            //add residue to selection
            if (typeof selection[pose.id] === 'undefined') {
              selection[pose.id] = {};
            }
            if (typeof selection[pose.id][chain.name] === 'undefined') {
              selection[pose.id][chain.name] = {};
            }
            selection[pose.id][chain.name][residue.position] = true;
          }
        }
        return selection;
      }
      function freezePicks() {
        return _.merge({}, scope.frozenPicks, scope.fluidPicks);
      }

      viewer.on('click', function(picked, event) {
        scope.$apply(function() {
          if (picked === null) {
            //Clicking on background erases all picks
            //unless control key or shift key is down.
            //This prevents the selection from clearing
            //while user is trying to extend it.
            if (!event.ctrlKey && !event.shiftKey) {
              scope.frozenPicks = {};
              scope.fluidPicks = {};
              scope.picks = {};
              scope.anchor = null;
            }
            return;
          }

          var rendering = picked.object().geom;
          var atom = picked.object().atom;

          var residuePosition = atom.residue().num();
          var chainName = atom.residue().chain().name();
          var poseId = rendering.name();

          //find indexes
          var poseIndex = _.findIndex(scope.sequences, {id: poseId});
          var chainIndex = _.findIndex(scope.sequences[poseIndex].chains, {name: chainName});
          var residueIndex = _.findIndex(scope.sequences[poseIndex].chains[chainIndex].residues, {position: residuePosition});

          setTarget(poseIndex, chainIndex, residueIndex);

          //make selections like in sequence viewer onResidueMousedown
          //only difference: cannot select across multiple poses here
          if (event.shiftKey) {
            if (scope.anchor === null) {
              //can't make a selection without an anchor
              return;
            }
            if (scope.anchor.pose !== scope.target.pose) {
              //can't extend a selection across poses
              return;
            }
            if (!event.ctrlKey) {
              scope.frozenPicks = {};//replace all
            }
            //replace last
            scope.fluidPicks = makeSelection();
          } else {
            //set target as anchor
            setAnchor(poseIndex, chainIndex, residueIndex);
            if (event.ctrlKey) {
              scope.frozenPicks = freezePicks();
            } else {
              scope.frozenPicks = {};//replace all
            }
            //new 1x1 selection
            scope.fluidPicks = makeSelection();
          }
          scope.picks = freezePicks();
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
