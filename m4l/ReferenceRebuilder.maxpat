{
 "patcher": {
  "fileversion": 1,
  "appversion": {
   "major": 8,
   "minor": 1,
   "revision": 11,
   "architecture": "x64",
   "modernui": 1
  },
  "classnamespace": "box",
  "rect": [
   100.0,
   100.0,
   1000.0,
   520.0
  ],
  "openrect": [
   0.0,
   0.0,
   640.0,
   169.0
  ],
  "openinpresentation": 1,
  "devicewidth": 640.0,
  "default_fontsize": 10.0,
  "default_fontname": "Arial",
  "gridsize": [
   8.0,
   8.0
  ],
  "description": "Analysiert eine Referenz-MP3 und baut Arrangement, Locators und Automation nach.",
  "boxes": [
   {
    "box": {
     "id": "obj-1",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      20.0,
      20.0,
      61.0,
      22.0
     ],
     "outlettype": [
      "signal",
      "signal"
     ],
     "text": "plugin~"
    }
   },
   {
    "box": {
     "id": "obj-2",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 0,
     "patching_rect": [
      20.0,
      400.0,
      68.0,
      22.0
     ],
     "text": "plugout~"
    }
   },
   {
    "box": {
     "id": "obj-3",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      300.0,
      300.0,
      280.0,
      22.0
     ],
     "outlettype": [
      "",
      ""
     ],
     "text": "node.script rr_node.js @autostart 1 @watch 0"
    }
   },
   {
    "box": {
     "id": "obj-4",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 9,
     "patching_rect": [
      300.0,
      340.0,
      420.0,
      22.0
     ],
     "outlettype": [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
     ],
     "text": "route status summary lom menu_drums menu_bass menu_other menu_vocals ready"
    }
   },
   {
    "box": {
     "id": "obj-5",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      380.0,
      380.0,
      89.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend lom"
    }
   },
   {
    "box": {
     "id": "obj-6",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      380.0,
      410.0,
      68.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "deferlow"
    }
   },
   {
    "box": {
     "id": "obj-7",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      380.0,
      440.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "js live_bridge.js"
    }
   },
   {
    "box": {
     "id": "obj-8",
     "maxclass": "live.drop",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      20.0,
      80.0,
      140.0,
      60.0
     ],
     "outlettype": [
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      4.0,
      4.0,
      144.0,
      56.0
     ],
     "varname": "reference_drop",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-9",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      150.0,
      96.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend file"
    }
   },
   {
    "box": {
     "id": "obj-10",
     "maxclass": "live.text",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      20.0,
      190.0,
      70.0,
      18.0
     ],
     "outlettype": [
      "",
      ""
     ],
     "text": "Analysieren",
     "presentation": 1,
     "presentation_rect": [
      4.0,
      64.0,
      70.0,
      18.0
     ],
     "texton": "Analysieren",
     "mode": 0,
     "saved_attribute_attributes": {
      "valueof": {
       "parameter_enum": [
        "off",
        "on"
       ],
       "parameter_longname": "analyze_button",
       "parameter_mmax": 1,
       "parameter_shortname": "Analysieren",
       "parameter_type": 2
      }
     },
     "parameter_enable": 1,
     "varname": "analyze_button",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-11",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 3,
     "patching_rect": [
      20.0,
      215.0,
      96.0,
      22.0
     ],
     "outlettype": [
      "",
      "",
      ""
     ],
     "text": "route bang 1"
    }
   },
   {
    "box": {
     "id": "obj-12",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      240.0,
      40.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "t b"
    }
   },
   {
    "box": {
     "id": "obj-13",
     "maxclass": "message",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      265.0,
      63.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "analyze"
    }
   },
   {
    "box": {
     "id": "obj-14",
     "maxclass": "live.text",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      100.0,
      190.0,
      70.0,
      18.0
     ],
     "outlettype": [
      "",
      ""
     ],
     "text": "Anwenden",
     "presentation": 1,
     "presentation_rect": [
      78.0,
      64.0,
      70.0,
      18.0
     ],
     "texton": "Anwenden",
     "mode": 0,
     "saved_attribute_attributes": {
      "valueof": {
       "parameter_enum": [
        "off",
        "on"
       ],
       "parameter_longname": "apply_button",
       "parameter_mmax": 1,
       "parameter_shortname": "Anwenden",
       "parameter_type": 2
      }
     },
     "parameter_enable": 1,
     "varname": "apply_button",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-15",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 3,
     "patching_rect": [
      100.0,
      215.0,
      96.0,
      22.0
     ],
     "outlettype": [
      "",
      "",
      ""
     ],
     "text": "route bang 1"
    }
   },
   {
    "box": {
     "id": "obj-16",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      100.0,
      240.0,
      40.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "t b"
    }
   },
   {
    "box": {
     "id": "obj-17",
     "maxclass": "message",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      100.0,
      265.0,
      49.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "apply"
    }
   },
   {
    "box": {
     "id": "obj-18",
     "maxclass": "live.text",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      180.0,
      190.0,
      70.0,
      18.0
     ],
     "outlettype": [
      "",
      ""
     ],
     "text": "Spuren",
     "presentation": 1,
     "presentation_rect": [
      4.0,
      86.0,
      70.0,
      16.0
     ],
     "texton": "Spuren",
     "mode": 0,
     "saved_attribute_attributes": {
      "valueof": {
       "parameter_enum": [
        "off",
        "on"
       ],
       "parameter_longname": "refresh_button",
       "parameter_mmax": 1,
       "parameter_shortname": "Spuren",
       "parameter_type": 2
      }
     },
     "parameter_enable": 1,
     "varname": "refresh_button",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-19",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 3,
     "patching_rect": [
      180.0,
      215.0,
      96.0,
      22.0
     ],
     "outlettype": [
      "",
      "",
      ""
     ],
     "text": "route bang 1"
    }
   },
   {
    "box": {
     "id": "obj-20",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      180.0,
      240.0,
      40.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "t b"
    }
   },
   {
    "box": {
     "id": "obj-21",
     "maxclass": "message",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      180.0,
      265.0,
      63.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "refresh"
    }
   },
   {
    "box": {
     "id": "obj-22",
     "maxclass": "live.toggle",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      300.0,
      15.0,
      15.0
     ],
     "outlettype": [
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      4.0,
      110.0,
      13.0,
      13.0
     ],
     "saved_attribute_attributes": {
      "valueof": {
       "parameter_enum": [
        "off",
        "on"
       ],
       "parameter_longname": "build_arrangement",
       "parameter_mmax": 1,
       "parameter_shortname": "Arrangement",
       "parameter_type": 2,
       "parameter_initial_enable": 1,
       "parameter_initial": [
        1
       ]
      }
     },
     "parameter_enable": 1,
     "varname": "build_arrangement"
    }
   },
   {
    "box": {
     "id": "obj-23",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      40.0,
      300.0,
      80.0,
      18.0
     ],
     "text": "Arrangement anlegen",
     "presentation": 1,
     "presentation_rect": [
      20.0,
      108.0,
      128.0,
      18.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-24",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      330.0,
      85.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend option build_arrangement"
    }
   },
   {
    "box": {
     "id": "obj-25",
     "maxclass": "live.toggle",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      110.0,
      300.0,
      15.0,
      15.0
     ],
     "outlettype": [
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      4.0,
      129.0,
      13.0,
      13.0
     ],
     "saved_attribute_attributes": {
      "valueof": {
       "parameter_enum": [
        "off",
        "on"
       ],
       "parameter_longname": "apply_automation",
       "parameter_mmax": 1,
       "parameter_shortname": "Automation",
       "parameter_type": 2,
       "parameter_initial_enable": 1,
       "parameter_initial": [
        1
       ]
      }
     },
     "parameter_enable": 1,
     "varname": "apply_automation"
    }
   },
   {
    "box": {
     "id": "obj-26",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      130.0,
      300.0,
      80.0,
      18.0
     ],
     "text": "Automation/Effekte",
     "presentation": 1,
     "presentation_rect": [
      20.0,
      127.0,
      128.0,
      18.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-27",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      110.0,
      330.0,
      85.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend option apply_automation"
    }
   },
   {
    "box": {
     "id": "obj-28",
     "maxclass": "live.toggle",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      200.0,
      300.0,
      15.0,
      15.0
     ],
     "outlettype": [
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      4.0,
      148.0,
      13.0,
      13.0
     ],
     "saved_attribute_attributes": {
      "valueof": {
       "parameter_enum": [
        "off",
        "on"
       ],
       "parameter_longname": "set_tempo",
       "parameter_mmax": 1,
       "parameter_shortname": "Tempo",
       "parameter_type": 2,
       "parameter_initial_enable": 1,
       "parameter_initial": [
        1
       ]
      }
     },
     "parameter_enable": 1,
     "varname": "set_tempo"
    }
   },
   {
    "box": {
     "id": "obj-29",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      220.0,
      300.0,
      80.0,
      18.0
     ],
     "text": "Tempo übernehmen",
     "presentation": 1,
     "presentation_rect": [
      20.0,
      146.0,
      128.0,
      18.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-30",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      200.0,
      330.0,
      85.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend option set_tempo"
    }
   },
   {
    "box": {
     "id": "obj-31",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 4,
     "patching_rect": [
      600.0,
      380.0,
      75.0,
      22.0
     ],
     "outlettype": [
      "",
      "",
      "",
      ""
     ],
     "text": "t b b b b"
    }
   },
   {
    "box": {
     "id": "obj-32",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      600.0,
      410.0,
      75.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "delay 300"
    }
   },
   {
    "box": {
     "id": "obj-33",
     "maxclass": "message",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      600.0,
      440.0,
      42.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "init"
    }
   },
   {
    "box": {
     "id": "obj-34",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      200.0,
      20.0,
      140.0,
      18.0
     ],
     "text": "Stem → Spur",
     "presentation": 1,
     "presentation_rect": [
      154.0,
      2.0,
      146.0,
      18.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-35",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      200.0,
      40.0,
      70.0,
      18.0
     ],
     "text": "Drums",
     "presentation": 1,
     "presentation_rect": [
      154.0,
      22.0,
      146.0,
      16.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-36",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      280.0,
      40.0,
      120.0,
      20.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      154.0,
      38.0,
      146.0,
      18.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_drums",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-37",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      420.0,
      40.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map drums"
    }
   },
   {
    "box": {
     "id": "obj-38",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      200.0,
      70.0,
      70.0,
      18.0
     ],
     "text": "Bass",
     "presentation": 1,
     "presentation_rect": [
      154.0,
      58.0,
      146.0,
      16.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-39",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      280.0,
      70.0,
      120.0,
      20.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      154.0,
      74.0,
      146.0,
      18.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_bass",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-40",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      420.0,
      70.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map bass"
    }
   },
   {
    "box": {
     "id": "obj-41",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      200.0,
      100.0,
      70.0,
      18.0
     ],
     "text": "Synths/Other",
     "presentation": 1,
     "presentation_rect": [
      154.0,
      94.0,
      146.0,
      16.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-42",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      280.0,
      100.0,
      120.0,
      20.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      154.0,
      110.0,
      146.0,
      18.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_other",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-43",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      420.0,
      100.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map other"
    }
   },
   {
    "box": {
     "id": "obj-44",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      200.0,
      130.0,
      70.0,
      18.0
     ],
     "text": "Vocals",
     "presentation": 1,
     "presentation_rect": [
      154.0,
      130.0,
      146.0,
      16.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-45",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      280.0,
      130.0,
      120.0,
      20.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      154.0,
      146.0,
      146.0,
      18.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_vocals",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-46",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      420.0,
      130.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map vocals"
    }
   },
   {
    "box": {
     "id": "obj-47",
     "maxclass": "textedit",
     "numinlets": 1,
     "numoutlets": 4,
     "patching_rect": [
      620.0,
      40.0,
      330.0,
      140.0
     ],
     "outlettype": [
      "",
      "int",
      "",
      ""
     ],
     "text": "Analyse-Ergebnis erscheint hier.",
     "presentation": 1,
     "presentation_rect": [
      306.0,
      4.0,
      330.0,
      138.0
     ],
     "readonly": 1,
     "lines": 0,
     "varname": "summary",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-48",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      620.0,
      190.0,
      330.0,
      18.0
     ],
     "text": "Starte ...",
     "presentation": 1,
     "presentation_rect": [
      306.0,
      146.0,
      330.0,
      18.0
     ],
     "ignoreclick": 1,
     "varname": "status",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-49",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      620.0,
      220.0,
      89.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend set"
    }
   },
   {
    "box": {
     "id": "obj-50",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      720.0,
      220.0,
      89.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend set"
    }
   }
  ],
  "lines": [
   {
    "patchline": {
     "source": [
      "obj-1",
      0
     ],
     "destination": [
      "obj-2",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-1",
      1
     ],
     "destination": [
      "obj-2",
      1
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-3",
      0
     ],
     "destination": [
      "obj-4",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-4",
      2
     ],
     "destination": [
      "obj-5",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-5",
      0
     ],
     "destination": [
      "obj-6",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-6",
      0
     ],
     "destination": [
      "obj-7",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-7",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-8",
      0
     ],
     "destination": [
      "obj-9",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-9",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-10",
      0
     ],
     "destination": [
      "obj-11",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-11",
      0
     ],
     "destination": [
      "obj-12",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-11",
      1
     ],
     "destination": [
      "obj-12",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-12",
      0
     ],
     "destination": [
      "obj-13",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-13",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-14",
      0
     ],
     "destination": [
      "obj-15",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-15",
      0
     ],
     "destination": [
      "obj-16",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-15",
      1
     ],
     "destination": [
      "obj-16",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-16",
      0
     ],
     "destination": [
      "obj-17",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-17",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-18",
      0
     ],
     "destination": [
      "obj-19",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-19",
      0
     ],
     "destination": [
      "obj-20",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-19",
      1
     ],
     "destination": [
      "obj-20",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-20",
      0
     ],
     "destination": [
      "obj-21",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-21",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-22",
      0
     ],
     "destination": [
      "obj-24",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-24",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-25",
      0
     ],
     "destination": [
      "obj-27",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-27",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-28",
      0
     ],
     "destination": [
      "obj-30",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-30",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-4",
      7
     ],
     "destination": [
      "obj-31",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-31",
      1
     ],
     "destination": [
      "obj-22",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-31",
      2
     ],
     "destination": [
      "obj-25",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-31",
      3
     ],
     "destination": [
      "obj-28",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-31",
      0
     ],
     "destination": [
      "obj-32",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-32",
      0
     ],
     "destination": [
      "obj-33",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-33",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-4",
      3
     ],
     "destination": [
      "obj-36",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-36",
      1
     ],
     "destination": [
      "obj-37",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-37",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-4",
      4
     ],
     "destination": [
      "obj-39",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-39",
      1
     ],
     "destination": [
      "obj-40",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-40",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-4",
      5
     ],
     "destination": [
      "obj-42",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-42",
      1
     ],
     "destination": [
      "obj-43",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-43",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-4",
      6
     ],
     "destination": [
      "obj-45",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-45",
      1
     ],
     "destination": [
      "obj-46",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-46",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-4",
      1
     ],
     "destination": [
      "obj-49",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-49",
      0
     ],
     "destination": [
      "obj-47",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-4",
      0
     ],
     "destination": [
      "obj-50",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-50",
      0
     ],
     "destination": [
      "obj-48",
      0
     ]
    }
   }
  ],
  "dependency_cache": [
   {
    "name": "rr_node.js",
    "type": "TEXT",
    "implicit": 1
   },
   {
    "name": "live_bridge.js",
    "type": "TEXT",
    "implicit": 1
   }
  ],
  "latency": 0,
  "is_mpe": 0
 }
}
