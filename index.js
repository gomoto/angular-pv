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
    pv.io.fetchPdb('//www.rcsb.org/pdb/files/' + pdbId.toUpperCase() + '.pdb', function(structure) {
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

  $scope.newPose = {};
  $scope.isPoseCreatorOpen = false;
  $scope.createPose = function(pdbId, name) {
    //clear newPose model
    $scope.newPose = {};
    //stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
    var poseId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
    name = name || 'Pose ' + ($scope.poses.length + 1);
    var color = poseColors[$scope.poses.length % poseColors.length];
    var renderMode = renderModes[4];
    $scope.addPose(poseId, pdbId, name, color, renderMode);
  };

}]);
