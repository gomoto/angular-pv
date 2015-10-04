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

  //coordinate with $scope.poses:
  //if a pose is removed, remove associated picks
  $scope.picks = {};

  //intermediate representation of $scope.picks
  //separates picks into multiple selections
  //each selection has same format as $scope.picks
  $scope.selections = [];

  //viewer(pv, sequence)-agnostic representation of residues:
  //properties: residue, chain, pose
  $scope.hover = null;
  $scope.anchor = null;

  //cache pdb structures processed by pv
  $scope.pdbStructures = {};

  //single source of truth
  $scope.poses = [];

  //define how to add and remove poses:
  $scope.addPose = function (poseId, pdbId, name, color, renderMode) {
    pv.io.fetchPdb('pdb/' + pdbId + '.pdb', function(structure) {
      //cache pdb structure
      $scope.pdbStructures[pdbId] = structure;
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
      $scope.$apply(function() {
        $scope.poses.push({
          id: poseId,
          pdb: pdbId,
          name: name,
          color: color || poseColors[0],
          renderMode: renderMode || renderModes[4],
          chains: chains
        });
      });
    });
  };
  $scope.removePose = function(poseId) {
    $scope.apply(function() {
      $scope.poses = _.filter($scope.poses, function(pose) {
        return pose.id !== poseId;
      });
      delete $scope.picks[poseId];
      //when are pdb structures removed from cache?
      //delete $scope.pdbStructures[poseId];
    });
  };
  function addPick(poseId, chainName, residuePosition) {
    if (typeof $scope.picks[poseId] === 'undefined') {
      $scope.picks[poseId] = {};
    }
    if (typeof $scope.picks[poseId][chainName] === 'undefined') {
      $scope.picks[poseId][chainName] = {};
    }
    $scope.picks[poseId][chainName][residuePosition] = true;
  }
  function removePick(poseId, chainName, residuePosition) {
    if (
      typeof $scope.picks[poseId] === 'undefined' ||
      typeof $scope.picks[poseId][chainName] === 'undefined'
    ) {
      return;
    }
    delete $scope.picks[poseId][chainName][residuePosition];
    //remove chain object if empty
    if (_.isEqual($scope.picks[poseId][chainName], {})) {
      delete $scope.picks[poseId][chainName];
    }
    if (_.isEqual($scope.picks[poseId], {})) {
      delete $scope.picks[poseId];
    }
  }
  $scope.clearPicks = function() {
    $scope.picks = {};
  };
  $scope.togglePick = function(poseId, chainName, residuePosition) {
    var isPicked = (
      $scope.picks[poseId] &&
      $scope.picks[poseId][chainName] &&
      $scope.picks[poseId][chainName][residuePosition]
    );
    if (isPicked) {
      removePick(poseId, chainName, residuePosition);
      //unset anchor
      $scope.anchor = null;
    } else {
      addPick(poseId, chainName, residuePosition);
      //set anchor
      $scope.anchor = {
        pose: poseId,
        chain: chainName,
        residue: residuePosition
      };
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

}]);
