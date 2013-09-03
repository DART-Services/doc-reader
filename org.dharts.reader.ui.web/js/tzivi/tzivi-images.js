/*  Title: tzivi-images.js
 *  Version: 
 *  Author: Neal Audenaert (neal@idch.org)
 *  Copyright: Institute for Digital Christian Heritage (IDCH) 
 *             All Rights Reserved.
 */

/**
 * Provides classes for working with tiled zoomable images.
 * 
 * @module tzivi
 * @submodule images
 */
IDCH.namespace("tzivi");
(function() {
    
// ======================================================================
// IMPORT STATEMENTS
// ======================================================================

var lang          = YAHOO.lang;
var util          = YAHOO.util;
var dom           = YAHOO.util.Dom;
var Event         = YAHOO.util.Event;
var EventProvider = YAHOO.util.EventProvider;
    
var Layer         = IDCH.tzivi.Layer;

//======================================================================
// SYMBOLIC CONSTANTS
//======================================================================

var LAYER_LOGGER = "IDCH.tzivi.TziLayer";
var SRC_LOGGER   = "IDCH.tzivi.TziSource";

var READY_EVENT         = "ready";
var CONFIG_FAILED_EVENT = "configFailed";

//==========================================================================
//TileManager CLASS 
//==========================================================================

/**
 * Defines the properties for tiles in a particular zoom level.
 *  
 * @class TileManager
 * @namespace IDCH.tzivi
 * @constructor
 * @private
 */
function TileManager(m_layer, m_tziSource) {  
    if (!lang.isValue(m_tziSource)) 
        throw "Tzi source image was not provided.";
    
    var id = m_layer.getId(),
        ix    = -1,                   // index of layer for by these properties
        ratio = 0,
        tw    = 0,                    // tile width
        th    = 0,                    // tile height
        ew    = 0,                    // width of edge tiles
        eh    = 0,                    // height of edge tiles
        rCol  = 0,                    // rightmost column
        bRow  = 0,                    // bottom most row
    
        m_pane       = m_layer.getPane(),
        m_viewport   = m_layer.getViewport(),
        activeImages = [];   // set of currently active IMG elements so 
                             // we don't have to find them in the DOM
    var that = {
        update : function() {   
            if (ratio == m_tziSource.getRatio()) return;  
            
            ix    = m_tziSource.getZoomLevel();
            ratio = m_tziSource.getRatio();
            th    = Math.round(m_tziSource.getTileHeight());
            tw    = Math.round(m_tziSource.getTileWidth());
            
            rCol  = m_tziSource.getNumberOfCols() - 1;  
            bRow  = m_tziSource.getNumberOfRows() - 1;  
            ew    = m_tziSource.getWidth() % tw;        
            eh    = m_tziSource.getHeight() % th;       
        },
        
        addTile : function(r, c) {
            var tileId = id + "__" + ix + ":" + r + "-" + c;  
            var img = activeImages[tileId];  
            if (img) return tileId;
            
            // create an image object
            img = document.createElement("img");
            dom.setStyle(img, "position", "absolute");
            
            // set url, id, and position 
            img.src = m_tziSource.getTileUrl(r, c);
            img.id  = tileId;
            img.style.top  = r * th + "px";
            img.style.left = c * tw + "px";

            activeImages[img.id] = img;
            
            // adjust size for edge tiles 
            img.width  = (c == rCol) ? ew : tw;
            if (rCol == 0) {           
                // if there's only one column, set the width based on the image ('ew' may be 0) 
                img.width = m_tziSource.getWidth();
            }
            
            img.height = (r == bRow) ? eh : th;
            if (bRow == 0) {
                // if there's only one row, set the height based on the image ('eh' may be 0) 
                img.height = m_tziSource.getHeight();
            }
            m_pane.appendChild(img);          // append image to the pane
            
            return tileId;
        },
        
        /** Removes the image from the DOM. */
        removeTile : function(img) {
            m_pane.removeChild(img);
            activeImages[img.id] = null;
        }
    };
    
    return that;
}

//==========================================================================
// TziLayer CLASS 
//==========================================================================

/**
 * Implements a generic interface to a tiled, zoomable image as a 
 * <code>Layer</code> object suitable for display in an 
 * <code>IDCH.tzivi.Viewport</code>. 
 * 
 * @class TziLayer
 * @namespace IDCH.tzivi-images
 * @param tziSource { TziSource } An object implementing that is able to 
 *      process requests for Tzi image components for a specific image source. 
 */
function TziLayer(m_tziSource) {
    
// sanity checks    
if (!lang.isObject(m_tziSource)) {
    throw "Cannot create TziLayer. No image source object provided.";
}

//====================================================
// PRIVATE PROPERTIES 
//====================================================    


/** 
 * The <code>TileManager</code> used to provide access to individual tiles.
 * 
 * @proprety m_tileManager
 * @type IDCH.tzivi.TileManager
 * @private
 */
var m_tileManager = null;

/**
 * The last calculated visible area.
 * 
 * @property m_visibleArea
 * @type Object
 * @private
 */
var m_visibleArea = {
    rows : { start : -1, end : -1 },
    cols : { start : -1, end : -1 }
};

/**
 * A reference to the display pane created by this <code>TziLayer</code>'s
 * superclass.  
 * 
 * @property pane
 * @type HTMLElement
 * @protected
 */
var m_pane = null;              

// TODO document me
var m_layer = null;

var m_viewport = null;

//====================================================
// PRIVATE METHODS 
//====================================================  
/**
 * Computes which tiles should be visible based on the current position of 
 * the underlying pane. If no new tiles have become visible, this returns an 
 * object whose 'changed' property is set to false. Otherwise, the 'changed' 
 * property of the returned object is set to true and the start and end 
 * values for the visible rows and columns are specified.
 * 
 * <p>
 * This method sets the <code>m_visibleArea</code> property of this object.
 * 
 * @method calcVisible
 * @private
 * @param force { boolean } Optional parameter indicating (if true) that the 
 *      visible region should be recalculated even if the area has not shifted
 *      to a newly visible row/column.
 * @return { Object } Returns an object representing the visible area in terms 
 *      of the rows and columns in the tiled image. This contains two 
 *      properties, <code>rows</code> and <code>cols</code>. Each of these two
 *      objects in turn has a <code>start</code> and <code>end</end> property
 *      representing the index of the first and last visible row or column 
 *      respectively. If the returned object's <code>changed</code> changed
 *      property is false, the visible region has not changed from the last 
 *      time it was computed, and the returned object does not contain valid 
 *      values.
 *      
 *      <p>The following code shows how to use the result to compute array 
 *      variables that identify the upper left and lower right hand tiles as 
 *      an (artificial) example of how to use this result.
 *      
 *      
 *      <pre>
   var ul, lr;     // upper left, lower right hand corners
   var area = calcVisible();
   if (area.changed) {
      ul = [area.cols.start, area.rows.start];
      lr = [area.cols.end, area.rows.end];
   }
       </pre>
 *        
 */
function calcVisible(force) {
    // calculate horizontal and vertical offset of current position
    var region  = dom.getRegion(m_viewport.getFrame());
    var paneR   = dom.getRegion(m_pane);
    if ((region === false) || (paneR === false)) {
        // one of the elements is not yet visible
        m_visibleArea.changed = false;
        return m_visibleArea;
    }
    
    var hOffset = region.left - paneR.left;    // horizontal offset of the panel
    var vOffset = region.top  - paneR.top;     // vertical offset of the panel
    var th      = m_tziSource.getTileHeight(); // base height of each tile 
    var tw      = m_tziSource.getTileWidth();  // base width of each tile

    // calculate starting position
    var startCol = Math.floor(hOffset / th);
    var startRow = Math.floor(vOffset / tw);
    if (startCol < 0) startCol = 0;
    if (startRow < 0) startRow = 0;
    
    var changed  = false;
    if (startCol != m_visibleArea.cols.start) changed = true;
    if (startRow != m_visibleArea.rows.start) changed = true;

    if (changed || force) {
        var ctCols = Math.ceil((region.right  - region.left) / tw);
        var ctRows = Math.ceil((region.bottom - region.top) / th);     
        var nRows  = m_tziSource.getNumberOfRows();
        var nCols  = m_tziSource.getNumberOfCols();
        
        // find the last row and column
        var lastRow = startRow + ctRows;        
        if (lastRow >= nRows) lastRow = nRows - 1;

        var lastCol = startCol + ctCols;        
        if (lastCol >= nCols) lastCol = nCols - 1;

        // construct the resulting dimensions
        m_visibleArea.changed    = true;
        m_visibleArea.rows.start = startRow;
        m_visibleArea.rows.end   = lastRow;
        m_visibleArea.cols.start = startCol;
        m_visibleArea.cols.end   = lastCol;
        
    } else { m_visibleArea.changed = false; }

    return m_visibleArea;
}

/** 
 * Called when the <code>TziSource</code> is ready. 
 * 
 * @method onSourceReady
 * @private 
 */
function onSourceReady() {
    // TECH NOTE: The Layer listens to for the READY_EVENT and updates the 
    //            display as needed. We just need to update the size of this
    //            layer and fire the event.
    ext.width  = m_tziSource.getAbsWidth();       
    ext.height = m_tziSource.getAbsHeight();      
   
    $info("TziLayer ready: " + m_tziSource, LAYER_LOGGER);
    that.provider.fireEvent(Layer.READY_EVENT, that);
    that.provider.fireEvent(Layer.RESIZE_EVENT, that);
}
 
/** 
 * Event handler for configuration failure events on the TziSource used by
 * this layer.
 * 
 * @method onSourceFailure
 * @private
 * @param args
 */
function onSourceFailure(args) {
    // XXX do something sensible
    $error("Cannot load layer. " +
    		"Failed to configure image source " + m_tziSource, LAYER_LOGGER);
}

//====================================================
// EXTEND THE BASE LAYER CLASS
//====================================================  
var ext = {
    /** 
     * The width (in pixels) of this layer at the 100% zoom ratio. This property  
     * should not be written except by it's implementing class. Changes to this 
     * property will result in a 'resize' event being fired.
     * 
     * @property width
     * @protected
     * @type Integer
     */
    width : null,
    
    /** 
     * The height (in pixels) of this layer at the 100% zoom ratio. This property  
     * should not be written except by it's implementing class. Changes to this 
     * property will result in a 'resize' event being fired.
     * 
     * @property height
     * @protected
     * @type Integer
     */
    height : null,
    
    /**
     * Configures this layer. See ILayerExt for details.
     * 
     * @method configure
     * @protected
     * @param layer { IDCH.tzivi.Layer } A reference to this layer's superclass
     * @param cfg { Object } Custom configuration parameters.
     */
    configure : function(layer, cfg) {
        // initialize private properties
        m_layer    = layer;
        m_viewport = m_layer.getViewport();
        m_pane     = m_layer.getPane();
        
        // attach listener and configure source
        if (m_tziSource.isReady()) {
            onSourceReady();
        } else {
            m_tziSource.on(READY_EVENT, onSourceReady);
            m_tziSource.on(CONFIG_FAILED_EVENT, onSourceFailure);
            
            m_tziSource.configure();
        }
    },
    
    isReady : function() {
        return m_tziSource.isReady(); 
    },
    
    paint : function() {
        // make sure the image source has been initialized.
        if (!that.isReady()) {
            var msg = "Cannot paint layer. Image source not ready: " + m_tziSource;
            $warn(msg, LAYER_LOGGER);
            return;
        } 
        
        dom.setStyle(m_pane, "display", "block");
        calcVisible();
        
        // exit if row/column position didn't change
        if (!m_visibleArea.changed) {
            return;
        }

        // hide while we're adding tiles.
        dom.setStyle(m_pane, "display", "none");
        
        // add all the visible tiles
        var visibleTiles = [];
        for (var r = m_visibleArea.rows.start; r <= m_visibleArea.rows.end; r++) {
            for (var c = m_visibleArea.cols.start; c <= m_visibleArea.cols.end; c++) {
                var tileId = m_tileManager.addTile(r, c);
                visibleTiles[tileId] = true;    // mark as visible
            }
        }
        
        // add buffered tiles
        var nRows  = m_tziSource.getNumberOfRows() - 1;
        var nCols  = m_tziSource.getNumberOfCols() - 1;
        
        var top    = (m_visibleArea.rows.start > 0)   ? m_visibleArea.rows.start - 1 : 0;
        var bottom = (m_visibleArea.rows.end < nRows) ? m_visibleArea.rows.end + 1 : nRows;
        var left   = (m_visibleArea.cols.start > 0)   ? m_visibleArea.cols.start - 1 : 0;
        var right  = (m_visibleArea.cols.end < nCols) ? m_visibleArea.cols.end + 1 : nCols;
        for (var r = top; r <= bottom; r++) {
            if ((r == top) || (r == bottom)) {
                for (var c = left; c <= right; c++) {
                    var tileId = m_tileManager.addTile(r, c);
                    visibleTiles[tileId] = true;
                } 
            } else {
                var tileId = m_tileManager.addTile(r, left);
                visibleTiles[tileId] = true;
    
                tileId = m_tileManager.addTile(r, right);
                visibleTiles[tileId] = true;
            }
        }
        
        // remove non-visible tiles
        var allTiles = m_pane.getElementsByTagName('img');
        for (var i = 0; i < allTiles.length; i++) {
            if (!visibleTiles[allTiles[i].id]) {
                m_tileManager.removeTile(allTiles[i]);
                i--; // removing a node, ensure we don't skip the next 
            }
        }
        
        // display the layer
        dom.setStyle(m_pane, "display", "block");
    },
    
    reset : function() {
        // make sure the image source has been initialized.
        if (!that.isReady()) {
            var msg = "Cannot reset layer. Image source not ready: " + m_tziSource;
            $warn(msg, LAYER_LOGGER);
            return;
        } 
        
        var ratio = m_viewport.getRatio();
        m_tziSource.setRatio(ratio);
        
        dom.setStyle(m_pane, "width",  m_tziSource.getWidth()  + "px");
        dom.setStyle(m_pane, "height", m_tziSource.getHeight() + "px");

        m_tileManager.update();                           // update tile properties
        
        // remove tiles
        var allTiles = m_pane.getElementsByTagName('img');
        for (var i = 0; i < allTiles.length; i++) {
            m_tileManager.removeTile(allTiles[i]);
            i--; // removing a node, ensure we don't skip the next 
        }
        
        // reset starting position
        m_visibleArea = {
            rows : { start : -1, end : -1 },
            cols : { start : -1, end : -1 }
        };
    }
};

var that = new Layer(ext);

//====================================================
// INITIALIZATION
//====================================================

m_tileManager = new TileManager(that, m_tziSource);

//====================================================
// ATTACH PUBLIC METHODS 
//====================================================

/**
 * Causes the viewport to snapto this layers image, showing the full image 
 * in the display area.
 * 
 * @method snapTo
 * @public
 */
that.snapTo = function() {
    if (!m_viewport.isVisible()) {
        $debug("Cannot snap TziLayer to viewport. Viewport is not visible.");
        return;
    }
    
    // resize so that the entire image is visible
    var max_w = m_tziSource.getAbsWidth();
    var max_h = m_tziSource.getAbsHeight();
    var reg   = m_viewport.getRegion();
    var vp_w  = reg.width;
    var vp_h  = reg.height;
    
    var ratio = m_viewport.getRatio();
    if (max_w > max_h) {        // if horizontal
        ratio = vp_w / max_w;
        if ((ratio * max_h) > vp_h)
            ratio = vp_h / max_h;     
    } else {
        ratio = vp_h / max_h;
        if ((ratio * max_w) > vp_w) 
            ratio = vp_w / max_w;       
    }
    
    // update the viewport's zoom ratio
    m_viewport.setRatio(ratio);   
};

/**
 * Returns a reference to the TziSource object this ImageLayer displays.
 * 
 * @method getTziSource
 * @public
 * @param { IDCH.images.TziSource } The TziSource object used to retrieve data
 *      for this image.
 */
that.getTziSource = function() {
    return m_tziSource;
};

return that;
}

//--------------------------------------------------------------------------
// TZI SOURCE CLASS 
//--------------------------------------------------------------------------

/**
 * Provides an generic implementation for retrieving data pertaining to a 
 * tiled, zoomable image. This class defines the Interface that will be relied
 * on by the TziLayer class and provides a basic implementation of that 
 * interface. Other TziSource implementations may be used, provided that they
 * adhere to the public interface defined by this class.
 * 
 * @class AbstractTziSource
 * @namespace IDCH.tzivi
 * @private 
 * @constructor
 * @param m_id { String } The URI for the specified image. This should be an 
 *      abolute (prefered) or relative URL to the image.
 * @param ext { Object } An extension object that supplies three methods:
 *      <ul>
 *        <li><code>getConfigUrl</code> - Returns the URL to use to retrieve
 *              the JSON configuration object.</li>
 *        <li><code>setJSON</code> - called by the configuration object to
 *              allow the extension to extract any needed information from
 *              the JSON object.</li>
 *        <li><code>getTileUrl</code> - constructs the URL to be returned 
 *              by this class' getTileUrl method.</li>
 *      </ul>
 */
function AbstractTziSource(m_id, ext) {
    
//----------------------------------------------------
// CUSTOM EVENTS 
//----------------------------------------------------
    
/**
 * The event provider to be used to fire and subscribe to events.
 * 
 * @property provider
 * @type { YAHOO.util.EventProvider }
 * @private 
 */
var provider = new EventProvider();

/**
 * Indicates that this TziSource has been properly configured and is ready
 * to be used. This event will be fired only once. 
 * 
 * @event ready
 * @param { TziSource } The tzi source that is ready.
 */
provider.createEvent(READY_EVENT, { fireOnce : true } );

/**
 * Indicates that an attempt to configure this TziSource has failed.
 * 
 * @event configFailed
 * @param args { Array } An array containing the following items.
 * <ul>
 *   <li>{ TziSource } The tzi source whose configuration failed. </li>
 *   <li>{ String } An error message describing the failure.</li>
 * </ul>
 */
provider.createEvent(CONFIG_FAILED_EVENT);
//----------------------------------------------------
// PRIVATE MEMBER VARIABLES
//----------------------------------------------------

/**
 * Indicates whether this TziSource has retrieved its initial configuration
 * information.
 * 
 * @property m_ready
 * @type Boolean
 * @private
 */
var m_ready        = false;

/**
 * The name of the referenced image
 * 
 * @property m_name
 * @type String
 * @private
 */
var m_name         = "";

/**
 * The fixed layers defined for the referenced image.
 * 
 * @property m_layers
 * @type Array
 * @private
 */
var m_layers       = [];

/**
 * The width (in pixels) of this image at its 100% zoom level.
 * 
 * @property m_width
 * @type Integer
 * @private
 */
var m_width        = 0;

/**
 * The height (in pixels) of this image at its 100% zoom level.
 * 
 * @property m_height
 * @type Integer
 * @private
 */
var m_height       = 0;

/**
 * The width (in pixels) of the tiles used in this image. Tiles on the far 
 * right hand edge of the image may (most likely will) have a different width
 * that may be computed using the formula:
 * 
 * <pre>
 * var tileWidth = m_width % m_tileWidth;
 * </pre>
 * 
 * @property m_tileWidth
 * @type Integer
 * @private
 */
var m_tileWidth    = 0;

/**
 * The height (in pixels) of the tiles used in this image. Tiles on the bottom 
 * edge of the image may (most likely will) have a different height that may
 * be computed using the formula:
 * 
 * <pre>
 * var tileHeight = m_height % m_tileHeight;
 * </pre>
 * 
 * @property m_tileHeight
 * @type Integer
 * @private
 */
var m_tileHeight   = 0;

/** 
 * The URL for the thumbnail. Depending on the implementation of the TziSource,
 * this URL may be interpreted relative to the base URI for this image. If the 
 * tzi image does not have a thumbnail, this should be null. 
 * 
 * @property m_thumbURL
 * @type String
 * @private
 */
var m_thumbURL = null;

/** 
 * The width (in pixels) of the thumbnail for this tzi image (if it exists).
 * 
 * @property m_thumbWidth
 * @type Integer
 * @private
 */
var m_thumbWidth = null;

/** 
 * The height (in pixels) of the thumbnail for this tzi image (if it exists).
 * 
 * @property m_thumbHeight
 * @type Integer
 * @private
 */
var m_thumbHeight = null;
/**
 * Information about the currently selected zoom layer. A zoom layer may 
 * represent a pre-computed 'fixed' zoom level in the source image or may be 
 * set to a 'fluid' zoom ratio (hence allowing continuous zooming) in which 
 * image tiles from the nearest fixed layer will be returned from the image's 
 * source data and be dynamically scaled as needed by the browser. 
 * 
 * @property m_currentLayer
 * @type Object
 * @private
 */
var m_currentLayer = {
    
    /**
     * The index of the nearest fixed layer.
     * 
     * @property m_currentLayer.ix
     * @type Integer
     * @private
     */
    ix : 0,
    
    /**
     * The fluid zoom ratio represented by this layer. 
     * 
     * @property m_currentLayer.ratio
     * @type Float
     * @private
     */
    ratio : 0,
    
    /** 
     * The scaling factor needed to adjust the 'fixed' tiles to the size needed
     * by the current fluid zoom ratio. A value of 1 indicates that this zoom 
     * ratio represents a fixed layer.
     * 
     * @property m_currentLayer.adjust
     * @type Float
     * @private
     */
    adjust : 1,
    
    /**
     * The width (in pixels) of this layer, account for any adjustments made
     * for continuous zooming.
     * 
     * @property m_currentLayer.w
     * @type Float
     * @private
     */
    w : 0,
    
    /**
     * The height (in pixels) of this layer, accounting for any adjustments 
     * made for continuous zooming. 
     * 
     * @property m_currentLayer.h
     * @type Integer
     * @private
     */
    h : 0,
    
    /**
     * The number of rows in this zoom level.
     * 
     * @property m_currentLayer.nRows
     * @type Integer
     * @private
     */
    nRows : 0,
    
    /**
     * The number of columns in this zoom level.
     * 
     * @property m_currentLayer.nCols
     * @type Integer
     * @private
     */
    nCols : 0
}

//----------------------------------------------------
//PRIVATE METHODS
//----------------------------------------------------
   
/**
 * Finds the fixed level whose ratio is closest to the desired ratio. 
 *
 * @method findClosestLevel
 * @param ratio ( Float } The target ratio for which the closest fixed level
 *      is desired.
 * @return { Integer } The index of the closest fixed zoom level.
 */
function findClosestLevel(ratio) {
    var closest = m_currentLayer.ix;
    var mindiff = Math.abs(ratio - m_layers[closest].ratio);
    
    for (var i = 0; i < m_layers.length; i++) {
        var layer = m_layers[i];
        var diff  = Math.abs(ratio - layer.ratio);
        
        if (diff < mindiff) {
            mindiff = diff;
            closest = i;
        }
    }
    
    // check to make sure nothing really strange happened.
    if ((closest < 0) || (closest >= m_layers.length)) {
        $error("TziSource (" + m_id + "): INTERNAL ERROR: " + 
            "Bizarre closest level (" + closest + "). Out of range.");
        if      (closest < 0)              closest = 0;
        else if (closest >= layers.length) closest = m_layers.length - 1;
    }
    
    return closest;
}

/**
 * Throws an exception if the TziSource isn't ready yet.
 * @method checkReady
 */
function checkReady() { 
   if (!m_ready) throw "TziSource is not yet ready: " + m_id;
}


//----------------------------------------------------
// PUBLIC PROPERTIES AND METHODS
//----------------------------------------------------
var that = {
        
    /**
     * Configures the information for this TziSource object based on data
     * from the underlying image source. If successful, this will fire the 
     * 'ready' event. If it fails, the 'configFailed' event will be fired.
     * This method executes asynchronously. Once configured, a TziSource 
     * cannot be reconfigured.
     * 
     * @method configure
     * @public
     */    
    configure : function() {
        // If already configured, just return without taking any action. 
        if (m_ready) {
            $debug("Already configured. No action taken.", SRC_LOGGER);
            return;
        }
        
        var url =  ext.getConfigUrl();
        util.Connect.asyncRequest("GET", url, {
            success : function(o) {
                var json  = o.responseText;
                try { 
                    json = lang.JSON.parse(json); 
                } catch (ex) {
                    var msg = "Failed to parse JSON object: " + ex;
                    $error(msg, SRC_LOGGER);
                    provider.fireEvent(CONFIG_FAILED_EVENT, [that, msg]);
                }
                
                // assign properties
                m_name       = json.name;
                m_width      = json.width;
                m_height     = json.height;
                m_tileWidth  = json.tw;
                m_tileHeight = json.th;
                m_layers     = json.layers;
                
                if (lang.isValue(json.thumb)) {
                    m_thumbURL    = json.thumb.url;
                    m_thumbWidth  = json.thumb.w;
                    m_thumbHeight = json.thumb.h;
                }
                
                ext.processJSON(json);
                
                // initialize to largest zoom level.
                m_ready = true;
                that.setLevel(m_layers.length - 1);
                $info("Configured TziSource: " + m_id, SRC_LOGGER);
                
                provider.fireEvent(READY_EVENT, that);
            },
            
            failure : function(o) {
                m_ready = false;
                var msg = "Could not retrieve configuration information " +
                    "from: " + url + ". Server responded: " + o.messageText;
                $warn(msg, SRC_LOGGER);
                provider.fireEvent(CONFIG_FAILED_EVENT, [that, msg]);
            }
        }); 
    },
    
    /** 
     * Indicates that this <code>TziSource</code> has been properly configured
     * and is ready to accept requests for information.
     *  
     * @method isReady
     * @public
     * @return { Boolean } <code>true</code> if the <code>TziSource</code> is 
     *      ready to be used, <code>false</code> if it is not.
     */
    isReady : function() { 
        return m_ready; 
    },
    
    /** 
     * Returns a URL that can be used to retrieve the indicated tile.  
     * 
     * @param r { Integer } The row index for the tile to be returned. Row
     *      indicies are zero based and must be in the range 
     *      [0..getNumberOfRows).
     * @param c { Integer } The column index for the tile to be returned. 
     *      Column indicies are zero based and must be in the range 
     *      [0..getNumberOfCols).
     * @param z { Integer } Optional, the zoom level for the tile to be 
     *      returned. By defualt, this will return the URL for tiles in the 
     *      current zoom level. 
     * @return { String } A URL that can be used to retrieve the indicated 
     *      tile.
     */
    getTileUrl : function(r, c, z) {
        checkReady();
        if (!lang.isNumber(z)) z = m_currentLayer.ix;
        
        // check boundary conditions
        // NOTE This checking takes time and is rarely needed. However, 
        //      boundary checking should be MUCH faster than the time to 
        //      download and render the image, so the assumption here is that
        //      the error checking is worth the performance hit. 
        // TODO This assumption should be tested.
        if ((z < 0) || (z > that.getMaxZoomLevel)) {
            var zoomerr = "The requested zoom level (" + z + ") does not " +
                "exist. The maximum zoom level is " + that.getMaxZoomLevel();
            
            $error(zoomerr);
            throw zoomerr;
        }
        
        if ((r >= m_layers[z].nRows) || (c >= m_layers[z].nCols) ||
            (r < 0) || (c < 0)) {
            var errmsg = "The specified tile (" + c + ", " + r + ") does " +
                "not exist at this zoom level (" + z + "). The maximum tile is: " +
                "(" + (m_layers[z].nCols - 1) + ", " + (m_layers[z].nRows - 1) + ")";
            
            $error(errmsg);
            throw errmsg;
        }
        
        return ext.getTileUrl(r, c, z);
    },

    /**
     * Attempts to set the zoom ratio to be used for retrieving tiles and for 
     * querying information about the width and height of the current layer.
     * The zoom ratio may be set to any value (within appropriate limits for 
     * the use and underlying image data) with a value of 1 representing 100%
     * of the source image's size. This support fluid zooming of the image.
     * 
     * <p>
     * Source images, however, are typically (not always) implemented with 
     * fixed zoom levels. The displayed image will use the closest fixed zoom
     * level  and rely on the browser to scale these images as needed in 
     * order to achieve a smooth zooming. Since browser-based image scaling may 
     * not be of suitable be, the <code>setLevel</code> method may be used to 
     * navigate through fixed zoom levels.
     * 
     * @method setRatio
     * @public
     * @param ratio { Float } The ratio to be set for this TziSource. If this 
     *      value is not supplied, this will simply reset the image to the 
     *      current zoom ratio.
     * @return { Float } The actual ratio set as a result by this operation.
     *      Note that this may be different that the supplied ratio if for 
     *      example, the source image does not provide data at the specified 
     *      resolution.
     */
    setRatio : function(ratio) {
        checkReady();
        
        // find the best layer for representing the image at this ratio
        ratio = lang.isValue(ratio) ? ratio : m_currentLayer.ratio;
        var level = findClosestLevel(ratio);
        var layer = m_layers[level];
        
        // set the values of the current layer
        m_currentLayer.ix     = level;
        m_currentLayer.ratio  = ratio;
        m_currentLayer.adjust = ratio / layer.ratio; 
        m_currentLayer.w      = Math.round(layer.w * m_currentLayer.adjust);
        m_currentLayer.h      = Math.round(layer.h * m_currentLayer.adjust);
        m_currentLayer.nCols  = layer.nCols;
        m_currentLayer.nRows  = layer.nRows;
        
        return ratio;
    },
    
    /***
     * Sets the zoom ratio to a fixed zoom level. 
     * 
     * @method setLevel
     * @public
     * @param level { Integer } The zoom level to be set.
     * @return { Integer } The actual zoom level that was set. This may differ 
     *      from the specified level if the specified level was out of range.  
     *
     */
    setLevel : function(level) {
        checkReady();
        if ((level < 0) || (level >= m_layers.length)) {
            var msg = "Attempt to set level failed. The specified level " +
            		"does not exist: " + level;
            $warn(msg, SRC_LOGGER);
            
            if (level < 0) 
                level = 0;
            if (level >= mLayers.length)
                level = mLayers.length - 1;
        }
        
        var layer = m_layers[level];
        
        m_currentLayer.ix     = level;
        m_currentLayer.ratio  = layer.ratio;
        m_currentLayer.adjust = 1.0; 
        m_currentLayer.w      = layer.w;
        m_currentLayer.h      = layer.h;
        m_currentLayer.nCols  = layer.nCols;
        m_currentLayer.nRows  = layer.nRows;
        
        return level;
    },
    
    /**
     * Returns the URI for the image this source object provides access to. 
     * Notes that this URI may reference the image itself or it may point 
     * specifically to the tiled representation of this image.
     *  
     * @method getUrl
     * @public
     * @return { String } The URI for the tiled image that this source provides
     *      access to. 
     * 
     * XXX This doesn't return a URI. It returns the id of this image, an ID 
     *     that is interpreted relative to the extension that embodies this
     *     TziSource
     */
    getUri : function() { 
        return m_id; 
    },
    
    /**
     * Returns the URL used to retrieve configuration information about this 
     * image. This can serve as a useful proxy for a identifier in many
     * practical situations, although, strictly speaking multiple URLs could 
     * point to the configuration information for the same image so it should
     * not be relied on as being unique. However, two different images should 
     * have different config URLs.
     * 
     *  @method getConfigUrl
     *  @private
     *  @return { String } The URL used to retrieve teh configuration 
     *          information for this image.
     */
    getConfigUrl : function() {
        return ext.getConfigUrl();
    },
    
    /**
     * Returns the width (in pixels) of the referenced image at the 100% zoom 
     * level. This will throw an exception if the source is not yet ready.
     * 
     * @method getAbsWidth 
     * @public
     * @return { Integer } The width of the referenced image at the 100%
     *      zoom level
     */
    getAbsWidth     : function() { 
        checkReady(); 
        return m_width; 
    },
    
    /** 
     * Returns the height (in pixels) of the referenced image at the 100% zoom 
     * level. This will throw an exception if the source is not yet ready.
     * 
     * @method getAbsHeight
     * @public
     * @return { Integer } The height of the referenced image at the 100%
     *      zoom level
     */
    getAbsHeight    : function() { 
         checkReady(); 
         return m_height; 
    },
    
    /**
     * Returns the width (in pixels) of the referenced image at the current 
     * zoom ratio. This will throw an exception if the source is not yet ready.
     * 
     * @method getAbsWidth
     * @public
     * @return { Integer } The width of the referenced image at the current
     *      (fluid) zoom ratio
     */
    getWidth : function() { 
        checkReady(); 
        return m_currentLayer.w;
    },
    
    /**
     * Returns the height (in pixels) of the referenced image at the current 
     * zoom ratio. This will throw an exception if the source is not yet ready.
     * 
     * @method getAbsHeight
     * @public
     * @return { Integer } The height of the referenced image at the current
     *      (fluid) zoom ratio 
     */
    getHeight : function() { 
         checkReady(); 
         return m_currentLayer.h; 
    },
    
    /**  
     * Returns the width of tiles (in pixels) at the current (fluid) zoom 
     * ratio. This value is adjusted from the width of the actual images of the 
     * tiles as required to scale from the fixed zoom level to the fluid zoom
     * ratio.
     * 
     * @method getTileWidth
     * @public
     * @return { Integer } The width of tiles at the current zoom ratio.
     */
    getTileWidth    : function() { 
         checkReady(); 
         return m_tileWidth * m_currentLayer.adjust; 
    },
    
    /**  
     * Returns the height of tiles (in pixels) at the current (fluid) zoom 
     * ratio. This value is adjusted from the width of the actual images of the 
     * tiles as required to scale from the fixed zoom level to the fluid zoom
     * ratio.
     * 
     * @method getTileHeight
     * @public
     * @return { Integer } The height of tiles at the current zoom ratio.
     */
    getTileHeight   : function() { 
        checkReady(); 
        return m_tileHeight * m_currentLayer.adjust; 
    },
    
    /** 
     * Returns the number of rows in the image at the current zoom level.
     * 
     * @method getNumberOfRows
     * @public
     * @return { Integer } The number of rows in the image at the current zoom
     *      level
     */
    getNumberOfRows : function() { 
        checkReady(); 
        return m_currentLayer.nRows; 
    },
    
    /** 
     * Returns the number of columns in the image at the current zoom level.
     * 
     * @method getNumberOfCols
     * @public
     * @return { Integer } The number of cols in the image at the current zoom
     *      level
     */
    getNumberOfCols : function() { 
        checkReady(); 
        return m_currentLayer.nCols; 
    },
    
    /** 
     * Returns the zoom ratio of the current state of this TziSource. The 
     * TziSource maintains an internal representation of the 'current' zoom
     * level so that it can cache information about the image properly scaled
     * to that ratio.
     * 
     *  @method getRatio
     *  @public
     *  @return { Float } The current zoom ratio.
     *  @see setRatio
     */
    getRatio : function() { 
        checkReady(); 
        return m_currentLayer.ratio;  
    },
    
    /** 
     * Returns the current (fixed) zoom level used to retrieve image tiles. 
     * Note that the tiles from this level may be adjusted to match the 
     * specified zoom ratio represented by the current state of this 
     * TziSource.
     * 
     * @method getZoomLevel
     * @public
     * @return { Integer } The current zoom level.
     */
    getZoomLevel : function() {
        checkReady();
        return m_currentLayer.ix;
    },
    
    /** 
     * Returns the maximum (largest sized image) zoom level that is defined 
     * for this image. 
     * 
     * @public getMaxZoomLevel
     * @public
     * @return { Integer } The maximum (largest sized image) zoom level that is
     *      defined for this image. 
     */
    getMaxZoomLevel : function() {
        checkReady();
        return m_layers.length - 1;
    },
    
    /** 
     * Returns a string representation of this <code>TziSource</code>.
     * 
     * @method toString
     * @public
     * @return { String } A string representation of this TziSource
     */
    toString : function() {
        if (!m_ready) 
            return "TziSource: " + m_id + ": Image details have not " +
            		"been loaded.";
        else 
            return "TziSource " + name + " (base url: " + m_id + ")";
    },

    /** 
     * Returns a longer string representation of this <code>TziSource</code>.
     * 
     * @method toString
     * @public
     * @return { String } A string representation of this TziSource
     */
    toLongString : function() {
        checkReady();
        var string = "TziviSource " + name + ": \n" +
            "Tile dimensions (" + m_tileWidth + " x " + m_tileHeight + ")\n" +
            "Layers: " + layers.length;
        return string;
    },

    /**
     * Compares this TziSource with the supplied source and returns true if 
     * the two point to the same image or false if they point to diffent images.
     * This relies on the URL of the configuration information as the 
     * identifier for the image. Technically speaking, one image may have more 
     * than one URL, so this method should not be relied upon when a gaurantee
     * of the uniqueness of two images is required.
     * 
     *  @method equals
     *  @public
     *  @param { AbstractTziSource } The TziSource to compare this object to.
     *  @return { Boolean } True if the two TziSoruce objects reference an 
     *          image with the same config URL, false otherwise.
     */
    equals : function(tziSource) {
        if (!lang.isValue(tziSource) || !lang.isFunction(tziSource.getConfigUrl)) {
            return false;
        }
            
        return (that.getConfigUrl() === tziSource.getConfigUrl());
    }
};

that.on             = provider.subscribe.bind(provider);
that.subscribe      = provider.subscribe.bind(provider);
that.unsubscribe    = provider.unsubscribe.bind(provider);
that.unsubscribeAll = provider.unsubscribeAll.bind(provider);

return that;
}

function TziSource(m_uri) {
    /**
     * The filename extension to be used when resolving tile images. For example
     * a tile format might specify that the tile <2,4> at zoom level 2 should be 
     * retrieved from uri/2/2-5.ext where '.ext' should be replaced with the 
     * appropriate file extension (e.g. .jpeg or .png). 
     * 
     * @property m_tileExtention
     * @type String
     * @private
     */
    var m_tileExtension = "jpeg";
    
    var ext = {
        getConfigUrl : function() {
            return m_uri + "/info.json";
        },
        
        getTileUrl : function(r, c, z) {
            return m_uri + "/" + z + "/" + c + "-" + r + "." + m_tileExtension;
        },
        
        processJSON : function(json) {
            m_tileExtension = json.ext;
        }
    };
    
    return AbstractTziSource(m_uri, ext);
}

function APITziSource(m_api, m_id) {
    var ext = {
        getConfigUrl : function() {
            return m_api + "?id=" + m_id + "&info";
        },
        
        getTileUrl : function(r, c, z) {
            return m_api + "?id=" + m_id + "&l=" + z + "&r=" + r + "&c=" + c;
        },
        
        processJSON : function(json) {
            
        }
    };
    
    return AbstractTziSource(m_id, ext);
}

IDCH.tzivi.TziSource    = TziSource;
IDCH.tzivi.APITziSource = APITziSource;
IDCH.tzivi.TziLayer     = TziLayer;

})(); // close and invoke containing fuction