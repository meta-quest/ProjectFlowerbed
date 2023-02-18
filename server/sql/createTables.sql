/* Copyright (c) Meta Platforms, Inc. and affiliates.

This source code is licensed under the MIT license found in the
LICENSE file in the root directory of this source tree. */

CREATE TABLE players (
  id INT NOT NULL auto_increment,
  token VARCHAR(16) NOT NULL,
  settings_json TEXT,
  -- json string for storing player settings
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_modified DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP PRIMARY KEY (id),
  UNIQUE (token)
);

CREATE TABLE gardens (
  id INT NOT NULL auto_increment,
  player_id INT NOT NULL,
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_modified DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  forked_garden_id INT,
  -- id of garden from which this garden is duplicated from
  garden_thumbnail_image BLOB,
  -- thumbnail image can be null when first created, use a default image in that case
  garden_data_json TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
  PRIMARY KEY (id)
);