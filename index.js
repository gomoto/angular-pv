//adding chains to poses, now angular is watching chains

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

function normalizedCtrlKey(event) {
  return event.ctrlKey || event.metaKey;
}

angular.module('CyDirectives', []);

angular.module('cyViewer', ['CyDirectives'])

.controller('cyViewerCtrl', ['$scope', '$timeout', '$http', function($scope, $timeout, $http) {
  //simulate session scope

  var poseColors = ['#42A5F5', '#EF5350', '#AEEA00'];
  var renderModes = ['sline', 'lines', 'trace', 'lineTrace', 'cartoon', 'tube', 'spheres', 'ballsAndSticks'];//viewer.RENDER_MODES

  //intermediate representation of $scope.picks
  //frozen picks do not change with each shift+click
  //fluid picks change with each shift+click
  $scope.frozenPicks = {};
  $scope.fluidPicks = {};
  function freezePicks() {
    return _.merge({}, $scope.frozenPicks, $scope.fluidPicks);
  }

  //viewer(pv, sequence)-agnostic representation of residues:
  //properties: residue, chain, pose
  $scope.hover = null;
  $scope.anchor = null;
  $scope.target = null;
  function setAnchor(poseIndex, chainIndex, residueIndex) {
    $scope.anchor = {
      pose: poseIndex,
      chain: chainIndex,
      residue: residueIndex
    };
  }
  function setTarget(poseIndex, chainIndex, residueIndex) {
    $scope.target = {
      pose: poseIndex,
      chain: chainIndex,
      residue: residueIndex
    };
  }
  function unsetAnchor() {
    $scope.anchor = null;
  }
  $scope.isResidueAnchor = function(poseIndex, chainIndex, residueIndex) {
    //Returns true if residue is the anchor residue
    if ($scope.anchor === null) {
      return false;
    }
    return (
      $scope.anchor.pose === poseIndex &&
      $scope.anchor.chain === chainIndex &&
      $scope.anchor.residue === residueIndex
    );
  };
  $scope.onSelectResidue = function(event, poseIndex, chainIndex, residueIndex, pickResidues) {
    setTarget(poseIndex, chainIndex, residueIndex);

    //make selections like in sequence viewer onResidueMousedown
    //only difference: cannot select across multiple poses here
    if (event.shiftKey) {
      if ($scope.anchor === null) {
        //can't make a selection without an anchor
        return;
      }
      if ($scope.anchor.pose !== $scope.target.pose) {
        //can't extend a selection across poses
        return;
      }
      if (!normalizedCtrlKey(event)) {
        $scope.frozenPicks = {};//replace all
      }
      //replace last
      $scope.fluidPicks = pickResidues($scope.anchor, $scope.target);
    } else {
      if (normalizedCtrlKey(event)) {
        //if target is already picked, unpick it
        var pose = $scope.sequences[$scope.target.pose];
        var chain = pose.chains[$scope.target.chain];
        var residue = chain.residues[$scope.target.residue];
        if (
          $scope.picks[pose.id] &&
          $scope.picks[pose.id][chain.name] &&
          $scope.picks[pose.id][chain.name][residue.position]
        ) {
          unsetAnchor();
          $scope.frozenPicks = freezePicks();
          delete $scope.frozenPicks[pose.id][chain.name][residue.position];
          //also delete empty objects
          if (_.isEqual($scope.frozenPicks[pose.id][chain.name], {})) {
            delete $scope.frozenPicks[pose.id][chain.name];
          }
          if (_.isEqual($scope.frozenPicks[pose.id], {})) {
            delete $scope.frozenPicks[pose.id];
          }
          $scope.fluidPicks = {};
        } else {
          setAnchor(poseIndex, chainIndex, residueIndex); //set target as anchor
          $scope.frozenPicks = freezePicks();
          $scope.fluidPicks = pickResidues($scope.anchor, $scope.target); //new 1x1 selection
        }
      } else {
        setAnchor(poseIndex, chainIndex, residueIndex); //set target as anchor
        $scope.frozenPicks = {};//replace all
        $scope.fluidPicks = pickResidues($scope.anchor, $scope.target); //new 1x1 selection
      }
    }
    $scope.picks = freezePicks();
  };
  $scope.onExtendSelection = function(event, poseIndex, chainIndex, residueIndex, pickResidues) {
    if ($scope.anchor === null) {
      //can't extend selection without an anchor
      return;
    }
    //update last selection, based on anchor residue
    setTarget(poseIndex, chainIndex, residueIndex);
    $scope.fluidPicks = pickResidues($scope.anchor, $scope.target);
    $scope.picks = freezePicks();
  };
  $scope.onSelectChain = function(event, poseIndex, chainIndex, pickChains) {
    if (event.shiftKey) {
      return;
    }
    if (normalizedCtrlKey(event)) {
      $scope.frozenPicks = freezePicks();
    } else {
      $scope.frozenPicks = {};//replace all
    }
    //set anchor to first residue in this chain
    //new 1xN selection
    setAnchor(poseIndex, chainIndex, 0);
    setTarget(poseIndex, chainIndex, 0);
    $scope.fluidPicks = pickChains($scope.anchor, $scope.target);
    $scope.picks = freezePicks();
  };
  $scope.onSelectPose = function(event, poseIndex, pickPoses) {
    if (event.shiftKey) {
      if ($scope.anchor === null) {
        //can't make a selection without an anchor
        return;
      }
      if (!normalizedCtrlKey(event)) {
        $scope.frozenPicks = {};//replace all
      }
      //replace last
      setTarget(poseIndex, 0, 0);
      $scope.fluidPicks = pickPoses($scope.anchor, $scope.target);
    } else {
      if (normalizedCtrlKey(event)) {
        $scope.frozenPicks = freezePicks();
      } else {
        $scope.frozenPicks = {};//replace all
      }
      //set anchor to first residue in first chain of this pose
      //new 1xN selection
      setAnchor(poseIndex, 0, 0);
      setTarget(poseIndex, 0, 0);
      $scope.fluidPicks = pickPoses($scope.anchor, $scope.target);
    }
    $scope.picks = freezePicks();
  };
  $scope.onUnselectPose = function(event, poseIndex) {
    //remove anchor
    unsetAnchor();
    //erase picks for the pose
    var poseId = $scope.sequences[poseIndex].id;
    $scope.frozenPicks = freezePicks();
    $scope.fluidPicks = {};
    delete $scope.frozenPicks[poseId];
    $scope.picks = freezePicks();
  };
  $scope.onUnselectAll = function(event) {
    $scope.frozenPicks = {};
    $scope.fluidPicks = {};
    $scope.picks = {};
    $scope.anchor = null;
  };
  $scope.onInvertAll = function(event) {
    //remove anchor
    unsetAnchor();
    //invert picks
    var inversion = {};
    $scope.sequences.forEach(function(pose, poseIndex) {
      pose.chains.forEach(function(chain, chainIndex) {
        chain.residues.forEach(function(residue, residueIndex) {
          if (
            $scope.picks[pose.id] &&
            $scope.picks[pose.id][chain.name] &&
            $scope.picks[pose.id][chain.name][residue.position]
          ) {
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
        });
      });
    });
    $scope.frozenPicks = inversion;
    $scope.fluidPicks = {};
    $scope.picks = freezePicks();
  };
  $scope.onInvertPose = function(event, poseIndex) {
    //remove anchor
    unsetAnchor();
    //invert only the specified pose
    var inversion = {};
    var poseId = $scope.sequences[poseIndex].id;
    $scope.sequences.forEach(function(pose) {
      pose.chains.forEach(function(chain) {
        chain.residues.forEach(function(residue) {
          if (
            $scope.picks[pose.id] &&
            $scope.picks[pose.id][chain.name] &&
            $scope.picks[pose.id][chain.name][residue.position]
          ) {
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
        });
      });
    });
    $scope.frozenPicks = inversion;
    $scope.fluidPicks = {};
    $scope.picks = freezePicks();
  };

  //these are keyed by pose id
  //pose existence defined by having a pdbData entry
  $scope.pdbData = {};
  $scope.displayNames = {};
  $scope.colors = {};
  $scope.renderModes = {};
  $scope.picks = {};

  //poses, chains, residues
  //generated from pdbData
  $scope.sequences = [];

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
        $scope.pdbData[poseId] = response.data;
        $scope.displayNames[poseId] = name || 'Pose ' + ( _.size($scope.displayNames) + 1 );
        $scope.colors[poseId] = color || poseColors[ _.size($scope.colors) % poseColors.length ];
        $scope.renderModes[poseId] = renderMode || renderModes[4];
      },
      function reject() {
        console.log(pdbUrl + ' not found');
      }
    );
    //clear newPose model
    $scope.newPose = {};
  };
  $scope.onRemovePose = function(poseId) {
    delete $scope.pdbData[poseId];
    delete $scope.displayNames[poseId];
    delete $scope.colors[poseId];
    delete $scope.renderModes[poseId];
    delete $scope.picks[poseId];
    delete $scope.frozenPicks[poseId];
    delete $scope.fluidPicks[poseId];
    unsetAnchor();
    $scope.sequences = _.reject( $scope.sequences, {'id': poseId} );
  };

}]);
