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

angular.module('CyDirectives', []);

angular.module('cyViewer', ['CyDirectives'])

.controller('cyViewerCtrl', ['$scope', '$timeout', function($scope, $timeout) {
  //simulate session scope

  var poseColors = ['#42A5F5', '#EF5350', '#AEEA00'];
  var renderModes = ['sline', 'lines', 'trace', 'lineTrace', 'cartoon', 'tube', 'spheres', 'ballsAndSticks'];//viewer.RENDER_MODES

  //single source of truth
  $scope.poses = [];

  //define how to add and remove poses:
  $scope.addPose = function (poseId, pdbId, name, color, renderMode) {
    //get pdb data, then add new pose
    pv.io.fetchPdb('pdb/' + pdbId + '.pdb', function(structure) {
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
      $scope.poses.push({
        id: poseId,
        pdb: pdbId,
        name: name,
        color: color || poseColors[0],
        renderMode: renderMode || renderModes[4],
        picks: {},
        chains: chains
      });
    });
  };
  $scope.removePose = function(poseId) {
    $scope.poses = _.filter($scope.poses, function(pose) {
      return pose.id !== poseId;
    });
  };
  //define how to manipulate picks
  $scope.clearPicks = function() {
    $scope.poses.forEach(function(pose) {
      pose.picks = {};
    });
  };
  function addPick(pose, chainName, residuePosition) {
    if (typeof pose.picks[chainName] === 'undefined') {
      pose.picks[chainName] = {};
    }
    pose.picks[chainName][residuePosition] = true;
  }
  function removePick(pose, chainName, residuePosition) {
    if (typeof pose.picks[chainName] === 'undefined') {
      return;
    }
    delete pose.picks[chainName][residuePosition];
    //remove chain object if empty
    if (_.isEqual(pose.picks[chainName], {})) {
      delete pose.picks[chainName];
    }
  }
  $scope.togglePick = function(poseId, chainName, residuePosition) {
    var pose = _.find($scope.poses, {id: poseId});
    var isPicked = pose.picks[chainName] && pose.picks[chainName][residuePosition];
    if (isPicked) {
      removePick(pose, chainName, residuePosition);
    } else {
      addPick(pose, chainName, residuePosition);
    }
  };



  //visual test: simulate adding and removing poses
  $timeout(function() {
    $scope.addPose('B49239482', '4ins', 'insulin');
  }, 500)
  .then(function() {
    return $timeout(function() {
      $scope.addPose('R52635777', '2kpo', 'poseWithReallyLongName', poseColors[1]);
    }, 500);
  });



  //viewer(pv, sequence)-agnostic representation of hovered residue
  $scope.hover = null;

  $scope.picks = {};
  
}]);
