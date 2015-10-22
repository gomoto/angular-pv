
var poseColors = ['#42A5F5', '#EF5350', '#AEEA00'];

function normalizedCtrlKey(event) {
  return event.ctrlKey || event.metaKey;
}

angular.module('CyDirectives', []);

angular.module('cyViewer', ['CyDirectives'])
.constant('pv', pv)
.constant('SELECTION_MODES', { residue: 'Residue', chain: 'Chain', molecule: 'Molecule' })
.constant('RENDER_MODES', {
  'cartoon': 'Cartoon',
  'tube': 'Tubes',
  'spheres': 'Spheres',
  'ballsAndSticks': 'Ball and Stick',
  //'trace': 'Tube Trace',
  'lineTrace': 'Line Trace',
  'sline': 'Smooth Line'
})
.constant('PALETTES', {
  'Clustal': {
    'A': '#ccff00',
    'R': '#1571f9',//#0061ef,//#0000ff,
    'N': '#cc00ff',
    'D': '#ff0000',
    'C': '#ffff00',
    'Q': '#ff00cc',
    'E': '#ff0066',
    'G': '#ff9900',
    'H': '#5298ff',//#0066ff,
    'I': '#66ff00',
    'L': '#33ff00',
    'K': '#a269f5',//#8433fb,//#761cfb,//#6600ff,
    'M': '#00ff00',
    'F': '#00ff66',
    'P': '#ffcc00',
    'S': '#ff3300',
    'T': '#ff6600',
    'W': '#00ccff',
    'Y': '#00ffcc',
    'V': '#99ff00',
    'B': '#ffffff',
    'X': '#ffffff',
    'Z': '#ffffff'
  },
  'Hydrophobicity': {
    'A': '#EF5350',//red
    'B': '#2196F3',//blue
    'C': '#BA68C8',//purple
    'D': '#2196F3',
    'E': '#2196F3',
    'F': '#EF5350',
    'G': '#BA68C8',
    'H': '#2196F3',
    'I': '#EF5350',
    'K': '#2196F3',
    'L': '#EF5350',
    'M': '#EF5350',
    'N': '#2196F3',
    'P': '#BA68C8',
    'Q': '#2196F3',
    'R': '#2196F3',
    'S': '#BA68C8',
    'T': '#BA68C8',
    'V': '#EF5350',
    'W': '#BA68C8',
    'X': '#BA68C8',
    'Y': '#BA68C8',
    'Z': '#2196F3'
  }
})
.controller('cyViewerCtrl', ['$scope', '$http', 'RENDER_MODES', 'SELECTION_MODES', function($scope, $http, RENDER_MODES, SELECTION_MODES) {
  //simulate session scope

  //list of pose IDs
  //defines pose existence
  $scope.poses = [];

  //these are keyed by pose ID
  $scope.sequences = {};
  $scope.pdbData = {};
  $scope.displayNames = {};
  $scope.colors = {};
  $scope.colorSchemes = {};
  $scope.renderModes = {};
  $scope.picks = {};

  //viewer(pv, sequence)-agnostic representation of residues:
  //properties: residue, chain, pose
  $scope.hover = null;

  //intermediate representation of $scope.picks
  //frozen picks do not change with each shift+click
  //fluid picks change with each shift+click
  var frozenPicks = {};
  var fluidPicks = {};
  function freezePicks() {
    return _.merge({}, frozenPicks, fluidPicks);
  }
  //anchor and target define the beginning and end of a square selection
  var anchor = null;
  var target = null;
  function setAnchor(poseIndex, chainIndex, residueIndex) {
    anchor = {
      pose: poseIndex,
      chain: chainIndex,
      residue: residueIndex
    };
  }
  function setTarget(poseIndex, chainIndex, residueIndex) {
    target = {
      pose: poseIndex,
      chain: chainIndex,
      residue: residueIndex
    };
  }
  function unsetAnchor() {
    anchor = null;
  }



  //scope for the pose creator
  $scope.newPose = {};
  $scope.isPoseCreatorOpen = false;

  //define how to add and remove poses:
  $scope.onAddPose = function (pdbId, name, color, renderMode) {
    //Create unique pose ID
    //stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
    var poseId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
    var pdbUrl = '//www.rcsb.org/pdb/files/' + pdbId.toUpperCase() + '.pdb';
    $http.get(pdbUrl) //note: $http callbacks are wrapped in $apply
    .then(
      function resolve(response) {
        $scope.poses.push(poseId);
        $scope.sequences[poseId] = {};
        $scope.pdbData[poseId] = response.data;
        $scope.displayNames[poseId] = name || pdbId;
        $scope.colors[poseId] = color || poseColors[ _.size($scope.colors) % poseColors.length ];
        $scope.colorSchemes[poseId] = 'pose';
        $scope.renderModes[poseId] = renderMode || 'cartoon';
      },
      function reject() {
        console.log(pdbUrl + ' not found');
      }
    );
    //clear newPose model
    $scope.newPose = {};
  };
  $scope.onRemovePose = function(poseId) {
    $scope.poses = _.reject( $scope.poses, function(id) {return id === poseId;} );
    delete $scope.sequences[poseId];
    delete $scope.pdbData[poseId];
    delete $scope.displayNames[poseId];
    delete $scope.colors[poseId];
    delete $scope.colorSchemes[poseId];
    delete $scope.renderModes[poseId];
    delete $scope.picks[poseId];
    delete frozenPicks[poseId];
    delete fluidPicks[poseId];
    unsetAnchor();
  };



  $scope.isResidueAnchor = function(poseIndex, chainIndex, residueIndex) {
    //Returns true if residue is the anchor residue
    if (anchor === null) {
      return false;
    }
    return (
      anchor.pose === poseIndex &&
      anchor.chain === chainIndex &&
      anchor.residue === residueIndex
    );
  };
  $scope.onSelectResidue = function(event, poseIndex, chainIndex, residueIndex, pickResidues) {
    setTarget(poseIndex, chainIndex, residueIndex);

    //make selections like in sequence viewer onResidueMousedown
    //only difference: cannot select across multiple poses here
    if (event.shiftKey) {
      if (anchor === null) {
        //can't make a selection without an anchor
        return;
      }
      if (anchor.pose !== target.pose) {
        //can't extend a selection across poses
        return;
      }
      if (!normalizedCtrlKey(event)) {
        frozenPicks = {};//replace all
      }
      //replace last
      fluidPicks = pickResidues(anchor, target);
    } else {
      if (normalizedCtrlKey(event)) {
        //if target is already picked, unpick it
        var poseId = $scope.poses[target.pose];
        var sequence = $scope.sequences[poseId];
        var chain = sequence.chains[target.chain];
        var residue = chain.residues[target.residue];
        if (
          $scope.picks[poseId] &&
          $scope.picks[poseId][chain.name] &&
          $scope.picks[poseId][chain.name][residue.position]
        ) {
          unsetAnchor();
          frozenPicks = freezePicks();
          delete frozenPicks[poseId][chain.name][residue.position];
          //also delete empty objects
          if (_.isEqual(frozenPicks[poseId][chain.name], {})) {
            delete frozenPicks[poseId][chain.name];
          }
          if (_.isEqual(frozenPicks[poseId], {})) {
            delete frozenPicks[poseId];
          }
          fluidPicks = {};
        } else {
          setAnchor(poseIndex, chainIndex, residueIndex); //set target as anchor
          frozenPicks = freezePicks();
          fluidPicks = pickResidues(anchor, target); //new 1x1 selection
        }
      } else {
        setAnchor(poseIndex, chainIndex, residueIndex); //set target as anchor
        frozenPicks = {};//replace all
        fluidPicks = pickResidues(anchor, target); //new 1x1 selection
      }
    }
    $scope.picks = freezePicks();
  };
  $scope.onExtendSelection = function(event, poseIndex, chainIndex, residueIndex, pickResidues) {
    if (anchor === null) {
      //can't extend selection without an anchor
      return;
    }
    //update last selection, based on anchor residue
    setTarget(poseIndex, chainIndex, residueIndex);
    fluidPicks = pickResidues(anchor, target);
    $scope.picks = freezePicks();
  };
  $scope.onSelectChain = function(event, poseIndex, chainIndex, pickChains) {
    if (event.shiftKey) {
      return;
    }
    if (normalizedCtrlKey(event)) {
      frozenPicks = freezePicks();
    } else {
      frozenPicks = {};//replace all
    }
    //set anchor to first residue in this chain
    //new 1xN selection
    setAnchor(poseIndex, chainIndex, 0);
    setTarget(poseIndex, chainIndex, 0);
    fluidPicks = pickChains(anchor, target);
    unsetAnchor();
    $scope.picks = freezePicks();
  };
  $scope.onSelectPose = function(event, poseIndex, pickPoses) {
    if (event.shiftKey) {
      if (anchor === null) {
        //can't make a selection without an anchor
        return;
      }
      if (!normalizedCtrlKey(event)) {
        frozenPicks = {};//replace all
      }
      //replace last
      setTarget(poseIndex, 0, 0);
      fluidPicks = pickPoses(anchor, target);
    } else {
      if (normalizedCtrlKey(event)) {
        frozenPicks = freezePicks();
      } else {
        frozenPicks = {};//replace all
      }
      //set anchor to first residue in first chain of this pose
      //new 1xN selection
      setAnchor(poseIndex, 0, 0);
      setTarget(poseIndex, 0, 0);
      fluidPicks = pickPoses(anchor, target);
      unsetAnchor();
    }
    $scope.picks = freezePicks();
  };
  $scope.onUnselectPose = function(event, poseIndex) {
    //remove anchor
    unsetAnchor();
    //erase picks for the pose
    var poseId = $scope.poses[poseIndex];
    frozenPicks = freezePicks();
    fluidPicks = {};
    delete frozenPicks[poseId];
    $scope.picks = freezePicks();
  };
  $scope.onUnselectAll = function(event) {
    frozenPicks = {};
    fluidPicks = {};
    $scope.picks = {};
    anchor = null;
  };
  $scope.onInvertAll = function(event) {
    //remove anchor
    unsetAnchor();
    //invert picks
    var inversion = {};
    $scope.poses.forEach(function(poseId) {
      var sequence = $scope.sequences[poseId];
      sequence.chains.forEach(function(chain) {
        chain.residues.forEach(function(residue) {
          if (
            $scope.picks[poseId] &&
            $scope.picks[poseId][chain.name] &&
            $scope.picks[poseId][chain.name][residue.position]
          ) {
            return;
          }
          //only pick non-picked residues
          if (typeof inversion[poseId] === 'undefined') {
            inversion[poseId] = {};
          }
          if (typeof inversion[poseId][chain.name] === 'undefined') {
            inversion[poseId][chain.name] = {};
          }
          inversion[poseId][chain.name][residue.position] = true;
        });
      });
    });
    frozenPicks = inversion;
    fluidPicks = {};
    $scope.picks = freezePicks();
  };
  $scope.onInvertPose = function(event, poseIndex) {
    //remove anchor
    unsetAnchor();
    //invert only the specified pose
    var inversion = {};
    var invertedPoseId = $scope.poses[poseIndex];
    $scope.poses.forEach(function(poseId) {
      var sequence = $scope.sequences[poseId];
      sequence.chains.forEach(function(chain) {
        chain.residues.forEach(function(residue) {
          if (
            $scope.picks[poseId] &&
            $scope.picks[poseId][chain.name] &&
            $scope.picks[poseId][chain.name][residue.position]
          ) {
            if (invertedPoseId === poseId) {
              return;
            }
          } else {
            if (invertedPoseId !== poseId) {
              return;
            }
          }
          //only pick residues not in pose that are already picked
          //and residues in pose that are not yet picked
          if (typeof inversion[poseId] === 'undefined') {
            inversion[poseId] = {};
          }
          if (typeof inversion[poseId][chain.name] === 'undefined') {
            inversion[poseId][chain.name] = {};
          }
          inversion[poseId][chain.name][residue.position] = true;
        });
      });
    });
    frozenPicks = inversion;
    fluidPicks = {};
    $scope.picks = freezePicks();
  };

  $scope.selectionModes = _.values(SELECTION_MODES);
  $scope.selectionMode = SELECTION_MODES.residue;

}]);
