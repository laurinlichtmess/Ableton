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
   260.0
  ],
  "openinpresentation": 1,
  "devicewidth": 640.0,
  "default_fontsize": 10.0,
  "default_fontname": "Arial",
  "gridsize": [
   8.0,
   8.0
  ],
  "description": "Loop Sketch: Genre-Templates auf Session-Szene-1-Loops anwenden (To Arr).",
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
     "text": "node.script ls_node.js @autostart 1 @watch 0"
    }
   },
   {
    "box": {
     "id": "obj-4",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 13,
     "patching_rect": [
      300.0,
      340.0,
      560.0,
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
      "",
      "",
      "",
      "",
      ""
     ],
     "text": "route status summary lom menu_template menu_kick menu_bass menu_hats menu_perc menu_synth menu_pad menu_fx ready"
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
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      20.0,
      20.0,
      120.0,
      18.0
     ],
     "text": "Loop Sketch",
     "presentation": 1,
     "presentation_rect": [
      4.0,
      4.0,
      120.0,
      16.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 12.0
    }
   },
   {
    "box": {
     "id": "obj-9",
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
     "text": "To Arr",
     "presentation": 1,
     "presentation_rect": [
      4.0,
      56.0,
      70.0,
      18.0
     ],
     "texton": "To Arr",
     "mode": 0,
     "saved_attribute_attributes": {
      "valueof": {
       "parameter_enum": [
        "off",
        "on"
       ],
       "parameter_longname": "to_arr_button",
       "parameter_mmax": 1,
       "parameter_shortname": "To Arr",
       "parameter_type": 2
      }
     },
     "parameter_enable": 1,
     "varname": "to_arr_button",
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-10",
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
     "id": "obj-11",
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
     "id": "obj-12",
     "maxclass": "message",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      265.0,
      56.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "to_arr"
    }
   },
   {
    "box": {
     "id": "obj-13",
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
     "text": "Spuren",
     "presentation": 1,
     "presentation_rect": [
      78.0,
      56.0,
      70.0,
      18.0
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
     "id": "obj-14",
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
     "id": "obj-15",
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
     "id": "obj-16",
     "maxclass": "message",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      100.0,
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
     "id": "obj-17",
     "maxclass": "live.toggle",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      180.0,
      300.0,
      15.0,
      15.0
     ],
     "outlettype": [
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      154.0,
      58.0,
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
        0
       ]
      }
     },
     "parameter_enable": 1,
     "varname": "set_tempo"
    }
   },
   {
    "box": {
     "id": "obj-18",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      200.0,
      300.0,
      100.0,
      18.0
     ],
     "text": "BPM-Hinweis setzen",
     "presentation": 1,
     "presentation_rect": [
      170.0,
      56.0,
      120.0,
      16.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-19",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      180.0,
      330.0,
      120.0,
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
     "id": "obj-20",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      20.0,
      60.0,
      100.0,
      18.0
     ],
     "text": "Template",
     "presentation": 1,
     "presentation_rect": [
      4.0,
      80.0,
      80.0,
      14.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-21",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      20.0,
      80.0,
      200.0,
      18.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      4.0,
      96.0,
      200.0,
      18.0
     ],
     "items": [
      "(laden)"
     ],
     "varname": "template_menu",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-22",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      110.0,
      100.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend template"
    }
   },
   {
    "box": {
     "id": "obj-23",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      20.0,
      140.0,
      140.0,
      18.0
     ],
     "text": "Role → Spur",
     "presentation": 1,
     "presentation_rect": [
      220.0,
      4.0,
      120.0,
      14.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 10.0
    }
   },
   {
    "box": {
     "id": "obj-24",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      240.0,
      40.0,
      70.0,
      18.0
     ],
     "text": "Kick",
     "presentation": 1,
     "presentation_rect": [
      220.0,
      20.0,
      90.0,
      12.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-25",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      320.0,
      40.0,
      100.0,
      18.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      220.0,
      32.0,
      90.0,
      16.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_kick",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-26",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      460.0,
      40.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map kick"
    }
   },
   {
    "box": {
     "id": "obj-27",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      240.0,
      76.0,
      70.0,
      18.0
     ],
     "text": "Bass",
     "presentation": 1,
     "presentation_rect": [
      220.0,
      56.0,
      90.0,
      12.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-28",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      320.0,
      76.0,
      100.0,
      18.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      220.0,
      68.0,
      90.0,
      16.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_bass",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-29",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      460.0,
      76.0,
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
     "id": "obj-30",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      240.0,
      112.0,
      70.0,
      18.0
     ],
     "text": "Hats",
     "presentation": 1,
     "presentation_rect": [
      220.0,
      92.0,
      90.0,
      12.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-31",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      320.0,
      112.0,
      100.0,
      18.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      220.0,
      104.0,
      90.0,
      16.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_hats",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-32",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      460.0,
      112.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map hats"
    }
   },
   {
    "box": {
     "id": "obj-33",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      240.0,
      148.0,
      70.0,
      18.0
     ],
     "text": "Perc",
     "presentation": 1,
     "presentation_rect": [
      220.0,
      128.0,
      90.0,
      12.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-34",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      320.0,
      148.0,
      100.0,
      18.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      220.0,
      140.0,
      90.0,
      16.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_perc",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-35",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      460.0,
      148.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map perc"
    }
   },
   {
    "box": {
     "id": "obj-36",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      400.0,
      40.0,
      70.0,
      18.0
     ],
     "text": "Synth",
     "presentation": 1,
     "presentation_rect": [
      320.0,
      20.0,
      90.0,
      12.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-37",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      480.0,
      40.0,
      100.0,
      18.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      320.0,
      32.0,
      90.0,
      16.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_synth",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-38",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      620.0,
      40.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map synth"
    }
   },
   {
    "box": {
     "id": "obj-39",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      400.0,
      76.0,
      70.0,
      18.0
     ],
     "text": "Pad",
     "presentation": 1,
     "presentation_rect": [
      320.0,
      56.0,
      90.0,
      12.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-40",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      480.0,
      76.0,
      100.0,
      18.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      320.0,
      68.0,
      90.0,
      16.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_pad",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-41",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      620.0,
      76.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map pad"
    }
   },
   {
    "box": {
     "id": "obj-42",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      400.0,
      112.0,
      70.0,
      18.0
     ],
     "text": "FX",
     "presentation": 1,
     "presentation_rect": [
      320.0,
      92.0,
      90.0,
      12.0
     ],
     "ignoreclick": 1,
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-43",
     "maxclass": "umenu",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      480.0,
      112.0,
      100.0,
      18.0
     ],
     "outlettype": [
      "int",
      "",
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      320.0,
      104.0,
      90.0,
      16.0
     ],
     "items": [
      "Auto",
      ",",
      "Keine"
     ],
     "varname": "map_fx",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-44",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      620.0,
      112.0,
      110.0,
      22.0
     ],
     "outlettype": [
      ""
     ],
     "text": "prepend map fx"
    }
   },
   {
    "box": {
     "id": "obj-45",
     "maxclass": "textedit",
     "numinlets": 1,
     "numoutlets": 4,
     "patching_rect": [
      620.0,
      40.0,
      330.0,
      180.0
     ],
     "outlettype": [
      "",
      "int",
      "",
      ""
     ],
     "text": "Template und Zuordnung erscheinen hier.",
     "presentation": 1,
     "presentation_rect": [
      420.0,
      4.0,
      216.0,
      230.0
     ],
     "readonly": 1,
     "lines": 0,
     "varname": "summary",
     "fontname": "Arial",
     "fontsize": 9.0
    }
   },
   {
    "box": {
     "id": "obj-46",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      620.0,
      230.0,
      330.0,
      18.0
     ],
     "text": "Starte ...",
     "presentation": 1,
     "presentation_rect": [
      4.0,
      238.0,
      632.0,
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
     "id": "obj-47",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      620.0,
      280.0,
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
     "id": "obj-48",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      720.0,
      280.0,
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
     "id": "obj-49",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      600.0,
      380.0,
      47.0,
      22.0
     ],
     "outlettype": [
      "",
      ""
     ],
     "text": "t b b"
    }
   },
   {
    "box": {
     "id": "obj-50",
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
     "id": "obj-51",
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
      "obj-9",
      0
     ],
     "destination": [
      "obj-10",
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
      "obj-10",
      1
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
      "obj-12",
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
      "obj-13",
      0
     ],
     "destination": [
      "obj-14",
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
      "obj-14",
      1
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
      "obj-16",
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
      "obj-17",
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
      "obj-21",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-21",
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
      "obj-22",
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
      "obj-25",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-25",
      1
     ],
     "destination": [
      "obj-26",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-26",
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
      "obj-28",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-28",
      1
     ],
     "destination": [
      "obj-29",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-29",
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
      "obj-34",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-34",
      1
     ],
     "destination": [
      "obj-35",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-35",
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
      8
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
      1
     ],
     "destination": [
      "obj-38",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-38",
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
      9
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
      1
     ],
     "destination": [
      "obj-41",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-41",
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
      10
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
      1
     ],
     "destination": [
      "obj-44",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-44",
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
      "obj-47",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-47",
      0
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
      "obj-4",
      0
     ],
     "destination": [
      "obj-48",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-48",
      0
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
      "obj-4",
      11
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
      1
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
      "obj-49",
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
      "obj-51",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "obj-51",
      0
     ],
     "destination": [
      "obj-3",
      0
     ]
    }
   }
  ],
  "dependency_cache": [
   {
    "name": "ls_node.js",
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
