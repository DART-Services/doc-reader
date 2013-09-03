/*  Title: tzivi.js
 *  Version: 
 *  Author: Neal Audenaert (neal@idch.org)
 *  Copyright: Institute for Digital Christian Heritage (IDCH) 
 *             All Rights Reserved.
 */

/**
 * @module tzivi
 * @requires yahoo, dom, event, dragdrop, slider
 */
IDCH.namespace("tzivi");
(function() {
    
// ======================================================================
// IMPORT STATEMENTS
// ======================================================================
var lang          = YAHOO.lang;
//var util          = YAHOO.util;
var dom           = YAHOO.util.Dom;
var Event         = YAHOO.util.Event;
//var EventProvider = YAHOO.util.EventProvider;
//var Slider        = YAHOO.widget.Slider;

// ==========================================================================
// VIEWPORT CLASS 
// ==========================================================================

//===================================
// EVENT NAMES
//===================================
var ZOOM_EVENT         = "zoom",
    PAN_EVENT          = "pan",
    RESIZE_EVENT       = "resize",
    VP_RESIZE_EVENT    = "vp-resize",
    ADD_LAYER_EVENT    = "addLayer",
    REMOVE_LAYER_EVENT = "layerRemoved",
    SHOW_EVENT         = "show",
    HIDE_EVENT         = "hide",
    DESTROY_EVENT      = "destroy";

// ===================================
// STATIC PRIVATE VARIABLES 
// ===================================
var VP_LOGGER = "IDCH.tzivi.Viewport",

    CSS_VIEWPORT = "viewport",      /** The top-level div of the viewport */
    CSS_VP_PANE  = "content-pane",  /** The content pane div for the viewport. */ 
    CSS_LAYER    = "layer",         /** The layer panes that support content display. */
    
    OUT_OF_BOUNDS = "OoB";          /** Out of bounds code for x,y positions. */

/**
 * Global variable (within this file) for auto-generating viewport ID values.
 * 
 * @property g_viewportId
 * @private
 */
var g_viewportId = 1;

/** 
 * Global variable (within this file) for auto-generating layer ID values.
 * 
 * @property g_layerId
 * @private
 */
var g_LayerId = 1;

// ===================================
// CONSTRUCTOR/OBJECT DEFN 
// ===================================
/**
 * The Viewport provides the main container for displaying zoomable image 
 * content. It implements the basic user interactions (zooming and panning) and 
 * maintains the point of reference that all content <code>Layer</code>s will 
 * use to determine their zoom ratio and position. 
 * 
 * @class Viewport
 * @namespace IDCH.tzivi
 * @constructor
 */
function Viewport(el, cfg) {

// ===================================
// CONFIGURE EVENTS 
// ===================================

/**
 * The <code>EventProvider</code> used to create and fire events for this 
 * <code>Viewport</code>.
 * 
 * @property provider
 * @type YAHOO.util.EventProvider
 * @private
 */
var provider = new EventProvider();

/**
 * Indicates that the zoom ratio has changed.
 * @event zoom 
 * @param args { Array } The arguments provided when this event is fired. These 
 *      are, in order:
 * <ul>
 *   <li>The viewport whose zoom level changed</li>
 *   <li>The ratio to which the zoom level changed</li>
 * </ul>
 */
provider.createEvent(ZOOM_EVENT);

/** 
 * Indicates that the Viewport's content has been panned.
 * @event pan
 * @param args { Array } The arguments provided when this event is fired. These 
 *      are, in order:
 * <ul>
 *   <li>The viewport whose content was panned</li>
 *   <li>An array containing the x, y coordinates of top left hand corner of 
 *          content pane</li>
 * </ul>
 */
provider.createEvent(PAN_EVENT);

/** 
 * Indicates that the size of the content displayed by this 
 * <code>Viewport</code> has changed. 
 * @event resize
 * @param args { Array } The arguments provided when this event is fired. These 
 *      are, in order:
 * <ul>
 *   <li>The <code>Viewport</code> whose content has been resized</li>
 *   <li>An array containing the new width and height of the content</li>
 * </ul>
 */
provider.createEvent(RESIZE_EVENT);

/**
 * Indicates that the <code>Viewport</code> (not its content) has been resized.
 * @event vp-resize
 * @param args { Array } The arguments provided when this event is fired. These 
 *      are, in order:
 * <ul>
 *   <li>The <code>Viewport</code> that has been resized</li>
 *   <li>An array containing the new width and height of the 
 *       <code>Viewport</code></li>
 * </ul>
 *  
 */
provider.createEvent(VP_RESIZE_EVENT);

/** 
 * Indicates that a new layer has been added to this <code>Viewport</code>.
 * @event addLayer
 * @param args { Array } The arguments provided when this event is fired. These 
 *      are, in order:
 * <ul>
 *   <li>The <code>Viewport</code> to which the layer was added</li>
 *   <li>The <code>Layer</code> that was added</li>
 * </ul>
 */
provider.createEvent(ADD_LAYER_EVENT);

/** 
 * Indicates that a layer was removed from <code>Viewport</code>.
 * @event removeLayer
 * @param args { Array } The arguments provided when this event is fired. These 
 *      are, in order:
 * <ul>
 *   <li>The <code>Viewport</code> from which the layer was removed</li>
 *   <li>The <code>Layer</code> that was removed</li>
 * </ul>
 */
provider.createEvent(REMOVE_LAYER_EVENT);


/** 
 * Indicates that the <code>Viewport</code> has been shown. 
 * @event show
 * @param viewport { Viewport } The shown viewport.
 */
provider.createEvent(SHOW_EVENT);

/** 
 * Indicates that the <code>Viewport</code> has been hidden. 
 * @event hide
 * @param viewport { Viewport } The hidden viewport.
 */
provider.createEvent(HIDE_EVENT);

/** 
 * Indicates that the <code>Viewport</code> has been destroyed and should 
 * no-longer be used. 
 * @event destroy
 * @param viewport { Viewport } The destroyed viewport.
 */
provider.createEvent(DESTROY_EVENT, { fireOnce : true });

//===================================
//PRIVATE VARIABLES 
//===================================


/** 
* The DIV forming the outer border of this viewport.
* @property frame
* @type HTMLElement
* @private
*/
var m_frame = null;

/** 
 * The DIV on which content will be displayed. The element is not used to 
 * display data directly, but acts as the parent for the different layers
 * that are displayed.
 * 
 * @property pane
 * @type HTMLElement
 * @private
 */
var m_pane = null;   

/**
 * The DragDrop object that controls the panning of the content pane.
 * 
 * @property paneDD
 * @type YAHOO.util.DD 
 * @private
 */
var m_paneDD = null;   

/**
 * Container for the different information layers displayed in the viewer. 
 * These inherit from the abstract class implemented by IDCH.tzivi.Layers.
 * 
 * @property layers 
 * @type IDCH.tzivi.Layer*
 * @private
 * 
 */
var m_layers = [];    

/**
 * The content <code>Layer<code> that currently has the user's focus (if
 * any). 
 * 
 * @property selectedLayer
 */
var m_selectedLayer = null;

/** 
 * The current dimensions of the viewport. This has two members, width 
 * and height.
 * 
 * @property dimensions
 * @type Object
 * @private 
 */
var m_dim   = {
    width : 0, 
    height : 0 
};

// ===================================
// PRIVATE METHODS 
// ===================================

/**
 * Initializes the internal structures. 
 * @method init
 * @private 
 */
function init() {
    // initialize configuration object
    $info("Initializing Viewport: " + el.id);
    cfg = cfg || {};
    lang.augmentObject(cfg, {
        visible   : true,  // FIXME make this actually do something
        vpWidth   : 600,   // Max width of the viewport 
        vpHeight  : 400,   // Max height of the viewport 
        width     : 600,   // Width of the content pane at 100% zoom 
        height    : 400,   // Height of the content pane at 100% zoom
        x         : 0,     // Initial x position
        y         : 0,     // Initial y position
        maxRatio  : 1.0,   // Maximum zoom ratio
        minRatio  : 0.001, // Minimum zoom ratio
        ratio     : 1      // Current zoom ratio 
    });
    
    m_dim.width  = Math.round(cfg.width * cfg.ratio);
    m_dim.height = Math.round(cfg.height * cfg.ratio);
    
    // construct the viewport frame
    m_frame    = document.createElement("div");
    m_frame.id = cfg.id || "tzivi-vp-" + g_viewportId++;
    dom.addClass(m_frame, CSS_VIEWPORT);
    dom.setStyle(m_frame, "width",  cfg.vpWidth + "px");
    dom.setStyle(m_frame, "height", cfg.vpHeight + "px");
    
    // create the underlying div on which content will be placed
    m_pane    = document.createElement("div");
    m_pane.id = m_frame.id + "_pane";
    dom.addClass(m_pane, CSS_VP_PANE);
    dom.setStyle(m_pane, "width",  cfg.width  + "px");
    dom.setStyle(m_pane, "height", cfg.height + "px");
    
    // make the pane draggable
    m_paneDD = new util.DD(m_pane, null, { scroll:false });
    m_paneDD.onDrag = function(e) {
        for (var i = 0; i < m_layers.length; i++) {
            try { m_layers[i].paint(); } 
            catch (ex) {
                // insulate from errors in third party code
                $warn("Failed to paint layer: " + ex);
            }
        }
    };
    
    m_paneDD.endDrag = function(e) {
        provider.fireEvent(PAN_EVENT, [that, dom.getXY(m_pane)]);
    };
    
    var region = dom.getRegion(m_frame);      // maybe getX, getY
    dom.setXY(m_paneDD.getEl(), [region.left, region.top]);
    // hide and append to the parent element
    dom.setStyle(m_frame, "display", "none");
    m_frame.appendChild(m_pane);
    el.appendChild(m_frame);
    dom.addClass(this.innerElement, CSS_VIEWPORT);
}
    
/**
 * Reset the content pane's contraints after it has been resized. 
 *  
 * @method resetPane
 * @private
 * @param absX { Number } The X coordinate for the center of the pane 
 *      (relative to the 100% resolution) after it has been reset.
 * @param absY { Number } The Y coordinate for the center of the pane 
 *      (relative to the 100% resolution) after it has been reset.
 */
function resetPane(absX, absY) {
    // make sure we know where the center should be
    absX = lang.isNumber(absX) ? absX : 0;
    absY = lang.isNumber(absY) ? absY : 0;
    
    // update pane dimensions
    dom.setStyle(m_pane, "width",  m_dim.width  + "px");
    dom.setStyle(m_pane, "height", m_dim.height + "px");
    
    $debug("Pane Dimensions: (" + m_dim.width + " x " + m_dim.height + ")",
            VP_LOGGER); 

    that.resetConstraints();
    that.setCenter(absX, absY);
}
 
/**
 * Listens for <code>Layer.RESIZE_EVENT</code>s and updates the  viewport's 
 * content pane if the dimensions of a layer have extended beyond the current 
 * boundaries of this pane.
 *
 * @method onLayerResize
 * @private
 * @param { Layer } layer The layer who's   
 */
function onLayerResize(layer) {
    var w = layer.getWidth(); 
    var h = layer.getHeight();
    
    var changed = false;
    if (w > cfg.width)  { 
        cfg.width  = w; 
        changed = true; 
    }
    
    if (h > cfg.height) { 
        cfg.height = h; 
        changed = true; 
    }
    
    if (changed) {
        that.setRatio();
        provider.fireEvent(RESIZE_EVENT, [that, [cfg.width, cfg.height]]);
    }
}
 
/** 
 * Shows all layers present in this viewport. The layers are shown silently, 
 * meaning that they will not fire their show event.
 *  
 * @method showLayers
 * @private
 * @param silent { Boolean } If true, indicates that that the layers should be
 *      shown silently (i.e. without firing the layer's SHOW event). True by 
 *      default.
 */
function showLayers(silent) {
    var layer;
    if (!lang.isBoolean(silent)) silent = true;
    
    for (var i = 0; i < m_layers.length; i++) {
        layer = m_layers[i]; 
        try {
            dom.setStyle(layer.getPane(), "zIndex", i);
            layer.show(silent);
        } catch (ex) {
            // insulate from errors in external code
            $warn("Failed to show layer (" + layer[i] + "): " + ex, VP_LOGGER)
        }
    }
}

/** 
* Hide all layers present in this viewport. The layers are hidden silently, 
* meaning that they will not fire their hide event.
*  
* @method hideLayers
* @private
* @param silent { Boolean } If true, indicates that that the layers should be
*      shown silently (i.e. without firing the layer's SHOW event). True by 
*      default.
*/
function hideLayers(silent) {
    if (!lang.isBoolean(silent)) silent = true;
    
    for (var i = 0; i < m_layers.length; i++) {
        try {
            m_layers[i].hide(silent);
        } catch (ex) {
            // insulate from errors in external code
            $warn("Failed to hide layer (" + m_layers[i] + "): " + ex, VP_LOGGER)
        }
    }
}

//=================================
// VIEWPORT OBJECT
//=================================

var that = {
    
    /**
     * Constrains the underlying display pane to stay within the bounding box
     * of the viewport. This should be called whenever the diminsions of the 
     * pane or the dimensions or location of the viewport might have changed. 
     * It is also called when the panel is initially rendered.
     * 
     * @method resetConstraints
     */
    resetConstraints : function() {
        var paneR  = dom.getRegion(m_pane);
        var region = dom.getRegion(m_frame);
        
        // adjust in case the pane has shrunk out of bounds
        var adj = { top:paneR.top, left:paneR.left }; 
        if (region.right > paneR.right) 
            adj.left = region.right - m_dim.width;  
        if (region.bottom > paneR.bottom) 
            adj.top = region.bottom - m_dim.height; 

        // make sure we are as wide and/or tall as the viewport
        if (adj.left > region.left) adj.left = region.left;
        if (adj.top > region.top)   adj.top  = region.top;
        
        // set the position of the pane, if needed
        if ((paneR.left != adj.left) || (paneR.top != adj.top)) {
            dom.setXY(m_pane, [adj.left, adj.top]);
            paneR = dom.getRegion(m_pane);
        }

        // calculate the maximum amount of movement allowed.
        var mvLeft  = Math.max(0, paneR.right  - region.right);
        var mvRight = Math.max(0, region.left  - paneR.left);
        var mvDown  = Math.max(0, region.top   - paneR.top);
        var mvUp    = Math.max(0, paneR.bottom - region.bottom);

        // Reinitialize the DD object's constraint parameters. 
        m_paneDD.clearConstraints();
        m_paneDD.setStartPosition();        
        m_paneDD.setInitPosition();        
        
        m_paneDD.setXConstraint(mvLeft, mvRight);
        m_paneDD.setYConstraint(mvUp, mvDown);

        // print lots of debug information
        $debug("Movement Constraints (up, down, left, right): " +
                mvUp + ", " + mvDown + ", " + mvLeft + ", " + mvRight, VP_LOGGER);
        $debug("Pane and Body Top: " + paneR.top + ", " + region.top, VP_LOGGER);
        $debug("Pane Constraints: " + m_paneDD.minY + ", " + m_paneDD.maxX + 
                               ", " + m_paneDD.maxY + ", " + m_paneDD.minX, VP_LOGGER);
    },
        
    //=================================
    // Content Positioning and Control 
    //=================================
    
    /** 
     * Return the minimum zoom ratio for this <code>Viewport</code>. The 
     * Viewport will not allow the ratio to be set to a samller value.
     * 
     * @method getMinRatio
     * @return { Number } The minimum zoom ratio for this <code>Viewport</code>
     */
    getMinRatio : function() { return cfg.minRatio; },
    
    /** 
     * Return the maximum zoom ratio for this <code>Viewport</code>. The 
     * Viewport will not allow the ratio to be set to a larger value.
     * 
     * @method getMaxRatio
     * @return { Number } The maximum zoom ratio for this <code>Viewport</code>
     */
    getMaxRatio : function() { return cfg.maxRatio; },
    
    /**
     * Returns a reference to the HTML content pane used by this 
     * <code>Viewport</code>. 
     * 
     * <p>
     * NOTE this reference MUST be used in a read only context. Clients that 
     * obtain a reference to this element must not attempt to reposition 
     * or resize this element manually. 
     * 
     * @method getContentPane 
     * @return { HTMLElement } The content pane used by this 
     *      <code>Viewport</code>.
     */
    getContentPane : function() { return m_pane; },
    
    /**
     * Returns the width of the content being displayed by this viewport as an 
     * absolute value (that is, relative to 100% zoom ratio).
     * 
     * @method getContentWidth
     * @return { Number } The width of the content displayed by this viewport.
     */
    getContentWidth : function() { return cfg.width; },
    
    /**
     * Returns the height of the content being displayed by this viewport as an 
     * absolute value (that is, relative to 100% zoom ratio).
     * 
     * @method getContentHeight
     * @return { Number } The height of the content displayed by this viewport.
     */
    getContentHeight : function() { return cfg.height; }, 
    
    /**
     * Translates the provided x, y page coordinates (e.g., from a mouse 
     * pointer position) into the x, y coordinates on the underlying 
     * content pane. This returned object will have two properties, 
     * <code>abs</code> and <code>rel</code>. <code>abs</code> contains the x,y
     * coordinates relative to the image at 100% resolution. <code>rel</code>
     * contains the x,y coordinates relative to the content pane at the current 
     * resolution. Both contain this informaiton in two properties 
     * <code>x</code> and <code>y</code>. 
     *  
     * <p>
     * The returned object has the following properties:
     *      
     *  rel  :   x,y coordinates of the point relative to the content pane
     *              at the current resolution.
     *  abs  :   x,y coordinates of the point relative to the content pane
     *              at the 100% resolution.
     *
     * @param iPageX { Number } X coordinate of a point relative to the 
     *      webpage (e.g. coordinates returned by mouse events).
     * @param iPageY { Number } Y coordinate of a point relative to the 
     *      webpage (e.g. coordinates returned by mouse events).
     * @return { Object } The position of the coordinates relative to the 
     *      underlying content both in absolute terms (i.e., relative to the 
     *      content at 100% zoom level) and in relative terms (i.e. relative to 
     *      the current upper left hand corner of the content pane at the 
     *      current zoom level. 
     */
    getXY : function(iPageX, iPageY) {
        // restate x and y relative to image pane
        var OoB   = OUT_OF_BOUNDS,
            ratio = cfg.ratio,
            paneR = dom.getRegion(m_pane),
            x = iPageX - paneR.left,
            y = iPageY - paneR.top;

        x = ((x < 0) || (x > m_dim.width))  ? OoB : Math.round(x / ratio);
        y = ((y < 0) || (y > m_dim.height)) ? OoB : Math.round(y / ratio);
        
        return [x, y];
    },
    
    /**
     * Translates the provided absolute x, y coordinates (i.e., relative to 
     * the viewport pane at a 100% zoom ratio) into x, y coordinates on the 
     * page. 
     *
     * @method getPageXY
     * @public
     * @param iAbsX { Number } X coordinate of a point relative to the 
     *      viewport's content pane at a 100% zoom ratio
     * @param iPageY { Number } Y coordinate of a point relative to the 
     *      viewport's content pane at a 100% zoom ratio 
     * @return { Array } An array containing two elements, the x and y 
     *      coordinates on the page of the supplied absolute point. 
     */
    getPageXY : function(iAbsX, iAbsY) {
        var region = dom.getRegion(m_pane),
            iRelX = Math.round(iAbsX * cfg.ratio),      
            iRelY = Math.round(iAbsY * cfg.ratio);
        
        return [iRelX + region.left, iRelY + region.top];
    },
    
    /**
     * Returns the center of the viewport relative to the content pane at 
     * the 100% zoom ratio.
     *          
     * @method getCenter
     * @return { Array } The [x, y] coordinates of the center of this viewport. 
     *      If the viewport is not visible, this will return false.              
     */
    getCenter : function() {
        if (!that.isVisible())
            return false;
        
        var region  = dom.getRegion(m_frame);
            iPageX = Math.round((region.left + region.right) / 2),
            iPageY = Math.round((region.top + region.bottom ) / 2);
        
        return that.getXY(iPageX, iPageY);
    },
    
    /**
     * Moves the specified point on the pane to the center of the viewport 
     * (or as close to the center as possible). The coordinates for the 
     * point to be centered are provided as absolute x, y image coordinates 
     * (i.e., x, y values relative to the 100% size of the underlying 
     * content pane). 
     *
     * @method setCenter
     * @param iAbsX { Number } The x coordinate of the point to be moved 
     *     to the center of the image.
     * @param iAbsY { Number } The y coordinate of the point to be moved 
     *     to the center of the image.
     */
    setCenter : function(iAbsX, iAbsY) {
        if ((iAbsX < 0) || (iAbsY < 0)) {
            $warn("Invalid center position (negative x or y value): " + 
                    iAbsX + ", " + iAbsY, VP_LOGGER);
            return;
        }

        // calculate offset from the point to center 
        var center = that.getCenter(),              
            absOffsetX = center[0] - iAbsX,      
            absOffsetY = center[1] - iAbsY;

        // adjust for the case that the center of the viewport is out of bounds
        if (!lang.isNumber(absOffsetX)) absOffsetX = 0;
        if (!lang.isNumber(absOffsetY)) absOffsetY = 0;
        
        // convert to page pixels
        var relOffsetX = Math.round(absOffsetX * cfg.ratio),
            relOffsetY = Math.round(absOffsetY * cfg.ratio),

        // find shifted top
            paneR = dom.getRegion(m_pane),
            left  = paneR.left + relOffsetX,
            top   = paneR.top + relOffsetY;

        // check to make sure this is in bounds
        if      (top < m_paneDD.minY) top = m_paneDD.minY;
        else if (top > m_paneDD.maxY) top = m_paneDD.maxY;

        if      (left < m_paneDD.minX) left = m_paneDD.minX;
        else if (left > m_paneDD.maxX) left = m_paneDD.maxX;

        // position the pane 
        dom.setXY(m_pane, [left, top]);
        provider.fireEvent(PAN_EVENT, [that, [left, top]]);

        $debug("Set Center: " + iAbsX + ", " + iAbsY, VP_LOGGER);
        $debug("Set Center - Current Ratio: " + cfg.ratio, VP_LOGGER);
        $debug("Set Center - Moved Pane to : " + top + ", " + left, VP_LOGGER);
    },
    
    //=============================================
    // LAYER MANIPULATION METHODS
    //=============================================
    
    /**
     * Adds a display layer to the viewport. 
     * 
     * @method addLayer
     * @param layer { IDCH.tzivi.Layer } The layer to be added. 
     * @param cfg { Object } Optional configuration parameters to be supplied 
     *      to the Layer.
     * @throws { String } If the provided layer is already attached to another 
     *      <code>Viewport</code>.
     */
    addLayer : function(layer) {
        var lPane = null, 
            changed = false, 
            w = 0, 
            h = 0;
        
        try {
            lPane = layer.getPane();   
            m_pane.appendChild(lPane);       
            
            layer.setViewport(that);    // throws ViewportAlreadySetException
            m_layers.add(layer);
            provider.fireEvent(ADD_LAYER_EVENT, [that, layer]);
            
            layer.subscribe(Layer.READY_EVENT, function() {
                // reset constraints
                onLayerResize(layer);        // update the underlying content pane if needed
                
                var visible = that.isVisible();
                that.show();        // update dragable constraints
                if (!visible)           // but hide this again if the viewport
                    that.hide();    // wasn't originally being displayed
                
                layer.paint();
                layer.subscribe(Layer.RESIZE_EVENT, onLayerResize); 
            });
            layer.configure(cfg);
        } catch (ex) {
            var msg = "Could not add layer. Is this a valid layer object? " +
            		"("+ ex + ")";
            $warn(msg);
            
            // if it's still there, try to remove it, but don't destory it.
            if (m_layers.contains(layer)) 
                that.remove(layer, true);
            throw msg;
        }
            
        return true;
    },
    
    /**
     * Removes the specified <code>Layer</code> from this <code>Viewport</code>.
     * By default, the removed <code>Layer</code> is destroyed. If this layer 
     * is to be attached to another <code>Viewport</code>, then specifying false
     * for the destroy parameter will prevent the destruction of the layer, 
     * allowing it to be reused.
     * 
     * <p>
     * Throws an exception if the supplied <code>Layer</code> does belong to 
     * this <code>Viewport</code>. 
     * 
     * @method removeLayer
     * @param layer { IDCH.tzivi.Layer } The layer to be removed.
     * @param keep { boolean } Optional parameter. If set to true, the removed 
     *      <code>Layer</code> will not be destroyed.
     */
    removeLayer : function(layer, keep) {
        if (!m_layers.contains(layer)) {
            var msg = "Could not remove layer: The specified layer does not " 
                        + "belong to this Viewport.";
            $warn(msg, VP_LOGGER);
        }
        
        // detach from internal controls
        m_layers.remove(m_layers.indexOf(layer));
        
        // supress errors in external code
        try {
            layer.hide();
            layer.unsubscribe(Layer.RESIZE_EVENT, onLayerResize);

            if (true !== keep) 
                layer.destroy(); 
        } catch (ex) {
            var msg = "An error occured trying to remove a layer: " + ex;
            $warn(msg, VP_LOGGER);
        }
        
        provider.fireEvent(REMOVE_LAYER_EVENT, [that, layer]);
    },
    
    /** 
     * Indicates whether the provided layer belongs to this 
     * <code>Viewport</code>.
     * @method hasLayer
     * @param layer { IDCH.tzivi.Layer } The layer to test.
     * @return { boolean } <code>true</code> if the supplied layer belongs to
     *      this <code>Viewport</code>, <code>false</code> if it does not. 
     */
    hasLayer : function(layer) {
        return m_layers.indexOf(layer) >= 0;
    },
    
    /**
     * Removes and destroys all layers in this <code>Viewport</code>.
     * 
     * @method clear
     */
    clear : function() {
        var name = null;
        
        for (var i = 0; i < m_layers.length; i++) {
            var layer = m_layers[i]; 
            m_layers[i] = null;
            try {
                name = layer.getName();   // for error reporting purposes
                layer.destroy();
            } catch (ex) {
                // insulate from errors in external code
                $warn("Failed to destroy layer (" + name + "): " + ex);
            }
        }
        
        // create a new, empty layers array.
        m_layers = [];
    },
    
    //======================================
    // Content Zooming 
    //======================================
    
    /** 
     * Returns the current zoom ratio for this <code>Viewport</code>.
     * 
     * @method getRatio
     * @return { Number } The current zoom ratio of this <code>Viewport</code>
     */
    getRatio : function()  { return cfg.ratio; },
    
    /**
     * Attempts to set the desired ratio for this <code>Viewport</code>. This 
     * ratio will be propegated to all layers which will update accordingly. The 
     * supplied value should be between <code>getMinRatio</code> and  
     * <code>getMaxRatio</code>. If it is not, it will be forced to the min or
     * max value respectively. The actual value set will be returned so the 
     * client can determine if any adjustments were performed.
     *
     * <p>
     * This fires a 'zoom' event to notify viewport listeners of the changed
     * zoom ratio.
     *  
     * @method setRatio
     * @param value { Number } The value of the zoom level to be set. This 
     *      value should be between the values <code>getMinRatio</code> and
     *      <code>getMaxRatio</code>. 
     * @return { Number } The actual zoom ratio that was set. This may be 
     *      adjusted to fit in the range defined for the viewport.
     */
    setRatio : function(value) {
        var center, iAbsX, iAbsY, visible = [];
        
     
        // adjust supplied ratio as needed 
        value = lang.isValue(value) ? value : cfg.ratio;
        if (value > cfg.maxRatio) {
            value = cfg.maxRatio;
        } else if (value < cfg.minRatio) { 
            value = cfg.minRatio;
        }
        
        center = that.getCenter();      // find initial viewport center
        
        // update the zoom ratio and content pane dimensions 
        cfg.ratio = value; 
        m_dim.width  = Math.round(cfg.width * cfg.ratio);  
        m_dim.height = Math.round(cfg.height * cfg.ratio);  
        
        iAbsX = (center === false) ? 0 : center[0];
        iAbsY = (center === false) ? 0 : center[1];
        
        // reset to center
        hideLayers();
        resetPane(iAbsX, iAbsY);
        showLayers();
        
        provider.fireEvent(ZOOM_EVENT, [that, cfg.ratio]);
        
        $debug("Ratio set: " + cfg.ratio, VP_LOGGER);
        return cfg.ratio;  // return the actual ratio, in case we adjusted it
    },
    
    //====================================
    // Viewport Positioning and Control 
    //====================================
    
    /**
     * Returns the HTML element that defines this viewport's display area.
     * 
     * @method getFrame
     * @return { HTMLElement } The HTML element that defines this viewport's 
     *      display area 
     */
    getFrame : function() { return m_frame; },
    
    /**
     * Returns an object that defines the extent of the viewport on the page.
     * This attaches measurements for the width and height to the standard
     * object returned by <code>YAHOO.util.Dom.getRegion</code>.  
     *  
     * @method getRegion
     * @public
     * @return { Object } An object that defines the extend of the viewport or 
     *      false if the viewport is not visible.
     */
    getRegion : function() {
        if (!that.isVisible())
            return false;
        
        var region  = dom.getRegion(m_frame);
        region.height = region.bottom - region.top;
        region.width  = region.right  - region.left;
            
        return region;
    },
    
    /** 
     * Returns an object that defines the extent of the viewport relative to 
     * the underlying content pane at 100% zoom. The object has the same 
     * properties as that returned by <code>getRegion</code> (<code>top</code>,
     * <code>left</code>, <code>bottom</code>, <code>right</code>,
     * <code>width</code>, <code>height</code>).
     *  
     * @method getAbsRegion
     * @public
     * @return { Object } An object that defines the extend of the viewport or 
     *      false if the viewport is not visible.
     */
    getAbsRegion : function() {
        if (!that.isVisible())
            return false;
        
        var region      = dom.getRegion(m_frame),
            topLeft     = that.getAbsXY(region.left, region.top),
            bottomRight = that.getAbsXY(region.right, region.bottom);
        
        return {
            top    : topLeft[1],     left   : topLeft[0],
            bottom : bottomRight[1], right  : bottomRight[0], 
            width  : bottomRight[0] - topLeft[0], 
            height : bottomRight[1] - topLeft[1] 
        };
    },
    
    /** 
     * Returns an object that defines the extent of the viewport relative to 
     * the underlying content pane at the current ratio. The object has the same 
     * properties as that returned by <code>getRegion</code> (<code>top</code>,
     * <code>left</code>, <code>bottom</code>, <code>right</code>,
     * <code>width</code>, <code>height</code>).
     *  
     * @method getRelRegion
     * @public
     * @return { Object } An object that defines the extend of the viewport or 
     *      false if the viewport is not visible.
     */
    getRelRegion : function() {
        if (!that.isVisible())
            return false;
        
        var region      = dom.getRegion(m_frame),
            topLeft     = that.getXY(region.left, region.top),
            bottomRight = that.getXY(region.right, region.bottom);
        
        return {
            top    : topLeft[1],     left   : topLeft[0],
            bottom : bottomRight[1], right  : bottomRight[0], 
            width  : bottomRight[0] - topLeft[0], 
            height : bottomRight[1] - topLeft[1] 
        };
    },
    
    /** 
     * Returns the height of the <code>Viewport</code> area (relative to 
     * the HTML page). 
     * 
     * @method getHeight
     * @return { Number } The height of the <code>Viewport</code> area 
     *      (relative to the HTML page) or NaN if the viewport is not visible. 
     */
    getHeight : function() {
        var reg = that.getRegion();
        return reg.bottom - reg.top;
    },

    /** 
     * Returns the width of the <code>Viewport</code> area (relative to 
     * the HTML page). 
     * 
     * @method getWidth
     * @return { Number } The width of the <code>Viewport</code> area 
     *      (relative to the HTML page) or NaN if the viewport is not visible. 
     */
    getWidth  : function() {
        var reg = that.getRegion();
        return reg.right - reg.left;
    },

    /** 
     * Sets the width and height of the <code>Viewport</code>.
     * 
     * @method setSize
     * @param w { Number } The width of the 
     */
    setSize : function(w, h) { 
        if (!lang.isNumber(w)) w = that.getWidth();
        if (!lang.isNumber(h)) h = that.getHeight();
        
        dom.setStyle(m_frame, "width", w + "px");
        dom.setStyle(m_frame, "height", h + "px");
        
        showLayers();
        provider.fireEvent(VP_RESIZE_EVENT, that);
    },
    
    /** 
     * Causes the <code>Viewport</code> and its content layers to be displayed.
     * This will call the <code>show</code> method on all content layers. Note,
     * however, that the <code>show</code> method on the content layer 
     * specifies that panels that are marked as not visible will not be made 
     * visible by a call to <code>show</code>. 
     * 
     * <p>
     * This method fires the <code>show</code> event.
     * 
     * @method show
     */
    show : function() { 
        dom.setStyle(m_frame, "display", "block");
        that.resetConstraints();
        showLayers(false /* not silent */);
        provider.fireEvent(SHOW_EVENT, that);
    },
    
    /**
     * Hides this <code>Viewport</code> (i.e., sets the display property of the 
     * frame to 'none') and invokes the <code>hide</code> method on all content
     * layers to enable them to perform any necessary cleanup.
     *
     * <p>
     * This method fires the <code>hide</code> event.
     * 
     * @method hide
     */
    hide : function() { 
        dom.setStyle(m_frame, "display", "none");
        hideLayers(false /* silent */);
        provider.fireEvent(HIDE_EVENT, that);
    },
    
    /**  
     * Indicates whether or not this <code>Viewport</code> is visible.
     * 
     * @method isVisible
     * @public
     * @return { Boolean } <code>true</code> if this <code>Viewport</code> is
     *      visible, <code>false</code> if it is not.
     */
    isVisible : function() {
        return (dom.getStyle(m_frame, "display") == "block");
    },
    
    /**
     * Destroys this <code>Viewport</code> freeing all resources and 
     * unsubscribing all event listeners. This method will destroy all content
     * layers as well.
     * 
     * <p>
     * This method fires the <code>destroy</code> event.
     * 
     * @method destroy
     */
    destroy : function() {
        m_paneDD.unreg();

        // clear all layers
        that.clear();

        // remove the frame
        Event.removeListener(m_frame);
        var parent = m_frame.parent;
        if (lang.isValue(parent)) parent.removeChild(m_frame);
        m_frame = null;
        
        // fire event and destroy the provider
        provider.fireEvent(DESTROY_EVENT, that);
        provider.unsubscribeAll();
    }
        
}; // END OF VIEW PORT OBJECT
    
    
    //=======================================================================
    // ATTACH EVENT PROVIDER
    //=======================================================================
    that.on             = provider.subscribe.bind(provider);
    that.subscribe      = provider.subscribe.bind(provider);
    that.unsubscribe    = provider.unsubscribe.bind(provider);
    that.unsubscribeAll = provider.unsubscribeAll.bind(provider);
    
    init();
    return that;            // return the constructed Viewport
};  // end Viewport constructor

// Attach symbolic constants for events
Viewport.PAN_EVENT          = PAN_EVENT;
Viewport.ZOOM_EVENT         = ZOOM_EVENT;
Viewport.RESIZE_EVENT       = RESIZE_EVENT;
Viewport.VP_RESIZE_EVENT    = VP_RESIZE_EVENT;

Viewport.ADD_LAYER_EVENT    = ADD_LAYER_EVENT;
Viewport.REMOVE_LAYER_EVENT = REMOVE_LAYER_EVENT;

Viewport.SHOW_EVENT         = SHOW_EVENT;
Viewport.HIDE_EVENT         = HIDE_EVENT;
Viewport.DESTROY_EVENT      = DESTROY_EVENT;

//=============================================================================
// ContentLayer
//=============================================================================

var CSS_VP_LAYER = "vp-layer";

var READY_EVENT   = "ready";
var PAINT_EVENT   = "paint";

// DUPLICATES OF THE VIEWPORT EVENT NAMES
// var RESIZE_EVENT  = "resize";
// var SHOW_EVENT    = "show";
// var HIDE_EVENT    = "hide";
// var DESTROY_EVENT = "destroy";

/**
 * 
 * @class Layer
 * @module IDCH.tzivi
 * @constructor
 * @param ext { Object } An object that extends this layer to implement custom 
 *      functionality. This object may have the following methods:
 *      <ul>
 *        <li><code>configure(layer, cfg)</code> - (optional)</li>
 *        <li><code>paint()</code> - (required)</li>
 *        <li><code>reset()</code> - (required)</li>
 *        <li><code>isReady()</code> - (required)</li>
 *      </ul> 
 */
function Layer(ext) {

// Make sure the extension is valid.    
if (!lang.isFunction(ext.paint) || 
    !lang.isFunction(ext.reset) ||
    !lang.isFunction(ext.isReady)) {

    throw "Invalid layer extension. A Layer object must be instantiated with" +
            "and extension object that implements the 'paint', 'reset' and " +
            "'isReady' methods.";
}

// -----------------------------------
// CONFIGURE EVENTS 
// -----------------------------------

/**
 * The <code>EventProvider</code> used to create and fire events for this 
 * <code>Layer</code>.
 * 
 * @property provider
 * @type YAHOO.util.EventProvider
 * @protected
 */
var provider = new EventProvider();

/**
 * Indicates that this layer is configured and ready for use. This event will 
 * be fired only once. 
 * @event ready
 * @param layer { Layer } The layer that has become ready.
 */
provider.createEvent(READY_EVENT, { fireOnce : true });

/** 
 * Indicates that the <code>Layer<code>'s content has been painted to its 
 * content pane. 
 * @event paint
 * @param layer { Layer } The layer that has been painted.
 */
provider.createEvent(PAINT_EVENT);

/** 
 * Indicates that the size of the content displayed by this <code>Layer</code> 
 * has changed. Note that this event is fired only when the underlying content
 * is resized relative to its 100% zoom size. It is not fired when the viewport
 * is zoomed in or out. Objects that need to listen to zoom events should 
 * subscribe to that event on the <code>Viewport</code>.   
 * 
 * @event resize
 * @param args { Array } The arguments provided when this event is fired. These 
 *      are, in order:
 * <ul>
 *   <li>The <code>Layer</code> whose content has been resized</li>
 *   <li>An array containing the new width and height of the content</li>
 * </ul>
 */
provider.createEvent(RESIZE_EVENT);

/** 
 * Indicates that the <code>Viewport</code> has been shown. 
 * @event show
 * @param layer { Layer } The shown layer.
 */
provider.createEvent(SHOW_EVENT);

/** 
 * Indicates that the <code>Viewport</code> has been hidden. 
 * @event hide
 * @param layer { Layer } The hidden layer.
 */
provider.createEvent(HIDE_EVENT);

/** 
 * Indicates that the <code>Viewport</code> has been destroyed and should 
 * no-longer be used. 
 * @event destroy
 * @param layer { Layer } The destroyed layer.
 */
provider.createEvent(DESTROY_EVENT, { fireOnce : true });

//-----------------------------------
// PRIVATE PROPERTIES
//-----------------------------------

/**
 * An autogenerated ID for this layer. 
 * 
 * @property m_id
 * @private
 * @type Integer
 * 
 */
m_id = "tzilayer_" + g_LayerId++;

/**
 * The DOM element that will be used to display this <code>Layer</code>'s 
 * content.
 * @property m_pane
 * @type HTMLElement 
 * @private
 */
var m_pane  = $EL("div", CSS_LAYER);

/**
 * The name for this layer (suitable for display). The name should be unique 
 * relative to a particular image, but does not have to be.
 * 
 * @property m_name
 * @type String
 * @private
 */
var m_name  = "unknown";

/** 
 * The <code>Viewport</code> this <code>Layer</code> belongs to or null if this
 * <code>Layer</code> has not been added to (or has been detached from) a 
 * <code>viewport</code>. 
 * @property m_vp
 * @type  IDCH.tzivi.Viewport  
 * @pravate
 */
var m_vp = null;

/** 
 * Private helper function to evaluate whether or not the provided extention
 * implements a given message.
 * 
 * @method checkExtFunction
 * @private
 * @param fnName { String } The name of the function to check.
 * @param errmag { String } The prefix for the error message to be logged if
 *      this fails. If this is not provided, no logging will be performed.
 * @return { Boolean } <code>true</code> if the extension implements the 
 *      specified method, <code>false</code> if it does not.
 */
function checkExtFunction(fnName, errmsg) {
    if (typeof ext[fnName] !== "function") {
        if (lang.isString(errmsg)) {
            $warn(errmsg + "Layer implementation does not provide " +
                    "'" + fnName + "' method.");
        }
        return false;
    } else {
        return true;
    }
}

var that = {
// -----------------------------------------------------------------------
// EXTENSION POINTS
// -----------------------------------------------------------------------        
    /**
     * Called by the <tt>Layer</tt> superclass following construction in order
     * to perform any required initial configuration.
     *
     * @method configure
     */
    configure : function(cfg) {
        var errmsg = "Could not configure layer: ";
        if (!checkExtFunction("configure", errmsg)) return;

        try {
            ext.configure(that, cfg);
        } catch (ex) {
            errmsg += "Layer implementation threw an exception - " + ex;
            $warn(errmsg);
        }
    },
    
    /**
     * Indicates whether or not this layer is ready to be accessed. 
     * @method isReady 
     */
    isReady : function() { 
        var result = false;
        var errmsg = "Could not check layer status: ";
        if (!checkExtFunction("isReady", errmsg)) return;

        try {
            result = ext.isReady();
        } catch (ex) {
            errmsg += "Layer implementation threw an exception - " + ex;
            $warn(errmsg);
            result = false;
        }
        
        return result;
    },
    
    /**
     * Paints this <code>Layer</code> invoking the provided implementation to 
     * display the visible content for this <code>Layer</code> at the 
     * appropriate zoom level. 
     *  
     * @method paint
     */
    paint : function() {
        // TECHNICAL NOTE: This will defer the painting to the extension, but 
        //      pane is displayed and sized by this method. 
        var errmsg  = "Could not paint layer: ";
        if (!checkExtFunction("paint", errmsg)) return;

        try {
            ext.paint();
            
            // set the layer's size and display it
            dom.setStyle(m_pane, "width", that.getRelativeWidth());
            dom.setStyle(m_pane, "height", that.getRelativeHeight());
            dom.setStyle(m_pane, "display", "block");
            
        } catch (ex) {
            errmsg += "Layer implementation threw an exception - " + ex;
            $warn(errmsg);
        }
    },
     
    /**
     * Abstract method to remove and/or reposition the content for this layer. 
     * This will be called whenever the layer is shown (prior to repainting) or 
     * hidden. It will also be called prior to destroying the layer. 
     * 
     * @method reset
     */
    reset : function() {
         var errmsg = "Could not reset layer: ";
         if (typeof ext.reset !== "function") {
             errmsg += "Layer implementation does not provide 'reset' method.";
             $warn(errmsg);
         }
         
         try {
             ext.reset();
         } catch (ex) {
             errmsg += "Layer implementation threw an exception - " + ex;
             $warn(errmsg);
         }
    },
     
// -----------------------------------------------------------------------
// GETTERS & SETTERS
// -----------------------------------------------------------------------
    /**
     * Returns the unique ID for this layer.
     * 
     * @method getId
     * @public
     * @return { String } The unique ID for this layer.
     */
    getId : function() {
        return m_id;
    },
    /**
     * Returns the name of this layer.  
     *
     * @method getName
     * @return { String } The name of this layer.
     */
    getName : function() { 
        return m_name; 
    },
    
    /**
     * Sets the name of this layer.
     * 
     * @method setName
     * @return n { String } The name to set for this layer.
     */
    setName : function(n) {
        m_name = n;
    },
    
    /**
     * Returns the DOM element on which this <code>Layer</code>'s content is 
     * displayed. 
     * 
     * @method getPane
     * @return { HTMLElement } the DOM element on which this 
     *      <code>Layer</code>'s content is displayed.
     */
    getPane : function() { 
         return m_pane; 
    },
       
    /**
     * Returns the <code>Viewport</code> in which this layer is displayed.
     * 
     * @method getViewport
     * @return { ViewPort } The <code>ViewPort</code> in which this layer 
     *      is displayed.
     */
    getViewport : function() { 
         return m_vp; 
    },
    
    /** 
     * Specifies the <code>Viewport</code> that this <code>Layer</code> belongs
     * to. This is intended for use only by the <code>Viewport</code> class.
     * 
     * @method setViewport
     * @protected
     */
    setViewport : function(vp) {
        if (lang.isValue(m_vp)) {
            throw "Viewport is already set. Cannot assign a layer to more " +
                    "than one viewport.";
        }
        
        m_vp = vp;
        
        // Since the layer may be removed without being destroyed, we need to 
        // set the viewport reference to null if this layer is removed.
        function onRemoval(args) {
            var layer = args[1];
            if (layer === that) {
                m_vp = null;
            }
            
            m_vp.unsubscribe(REMOVE_LAYER_EVENT, onRemoval);
        }
        
        m_vp.subscribe(REMOVE_LAYER_EVENT, onRemoval);
    },
    
    /**
     * Returns the width of this layer at 100% resolution.
     *  
     * @method getWidth
     * @return { Number } The width (at 100% resolution) of this content layer. 
     */ 
    getWidth   : function() { 
         return ext.width;  
    },
    
    /**
     * Returns the height (in pixels) of this layer at 100% resolution.
     *  
     * @method getHeight
     * @return { Number } The height (at 100% resolution) of this content layer.
     */
    getHeight  : function() { 
        return ext.height; 
    },
    
    /**
     * Returns the width of this layer (in pixels) at the current zoom ratio. 
     *  
     * @method getRelativeWidth
     * @return { Number } The width (at the current zoom ratio) of this 
     *      content layer.
     */
    getRelativeWidth : function() {
        return m_vp.getRatio() * ext.width;
    },
    
    /**
     * Returns the height of this layer (in pixels) at the current zoom ratio. 
     *  
     * @method getRelativeHeigth
     * @return { Number } The height (at the current zoom ratio) of this 
     *      content layer.
     */
    getRelativeHeight : function() {
        return m_vp.getRatio() * ext.height;
    },
    
    /** 
     * Indicates whether or not this <code>Layer</code> is visible.
     * 
     * @method isVisible
     * @public
     * @return { Boolean } <code>true</code> if this <code>Layer</code> is
     *      visible, <code>false</code> if it is not.
     */
    isVisible : function() {
        // XXX not exactly right, but better than toggling a visible flag
        return dom.getStyle(m_pane, "display") != "none";
    },
    
// -----------------------------------------------------------------------
// SHOW, HIDE & DESTROY
// -----------------------------------------------------------------------
    
    /** 
     * Displays this layer.
     *  
     * @method show  
     * @param silent { Boolean } Optional parameter that, if true, supresses 
     *      the firing fo the SHOW_EVENT. 
     * @throws { String } An exception if reset or paint fail.
     */
    show : function(silent) {
        if (that.isVisible()) return;      // already shown
        
        that.reset();
        that.paint();
        
        if (silent !== true) 
            provider.fireEvent(SHOW_EVENT, that);
    },
    
    /** 
     * Hides this layer.
     *  
     * @method hide
     * @param silent { Boolean } Optional parameter that, if true, suppresses 
     *      the firing fo the HIDE_EVENT. 
     * @throws { String } An exception if reset fails.
     */
    hide : function(silent) {
        if (!that.isVisible()) return;     // already hidden
        
        dom.setStyle(m_pane, "display", "none");
        that.reset();
        
        if (silent !== true) provider.fireEvent(HIDE_EVENT, that);
    },
     
    /**
     * Destroys this layer, removing all event listeners and DOM elements. This
     * should be called only once.
     * @method destroy
     * @method protected 
     */
    destroy : function() {
        // allow ext to clean up and detach from viewport 
        that.hide();
        if (lang.isObject(m_vp) && m_vp.hasLayer(that)) {
            m_vp.removeLayer(that, false);
        }
        
        // clean up the DOM
        Event.removeListener(m_pane);
        var parent = m_pane.parentNode;
        if (lang.isValue(parent)) 
            parent.removeChild(m_pane);
        m_pane = null;
        
        // destroy the provider
        provider.fireEvent(DESTROY_EVENT, that);
        provider.unsubscribeAll();
    }
};

//-----------------------------------------------------------------------
// ATTACH EVENT PROVIDER
//-----------------------------------------------------------------------
IDCH.makeProvider(that, provider);
that.provider       = provider;

return that;
}

Layer.READY_EVENT   = READY_EVENT;
Layer.PAINT_EVENT   = PAINT_EVENT;
Layer.RESIZE_EVENT  = RESIZE_EVENT;
Layer.SHOW_EVENT    = SHOW_EVENT;
Layer.HIDE_EVENT    = HIDE_EVENT;
Layer.DESTROY_EVENT = DESTROY_EVENT;

//-----------------------------------------------------------------------
// ILayerExtension
//-----------------------------------------------------------------------
/**
 * Defines the interface that must be implemented by all <code>Layer</code>
 * extension objects. The <code>Layer</code> constructor requires an extension
 * object that implements specific functionality for different types of layers. 
 * 
 * <p>
 * The methods of this interface are not intended to be accessed directly. 
 * Instead, they should be invoked only through the superclass methods of the
 * <code>Layer</code> class that they extend. 
 *  
 * @class ILayerExtension
 * @namespace IDCH.tzivi
 */
function ILayerExt() { }

ILayerExt.prototype = {
    /** 
     * The width of the content layer at 100% zoom level. If this value changes
     * the implementing class must fire a RESIZE_EVENT on the <code>Layer</code>
     * object's event provider. This property will not be modified directly 
     * by the <code>Layer</code>.
     * 
     * @property
     * @protected
     * @type { Number } 
     */
    width : null,
    
    /**  
     * The height of the content layer at 100% zoom level. If this value changes
     * the implementing class must fire a RESIZE_EVENT on the <code>Layer</code>
     * object's event provider. This property will not be modified directly 
     * by the <code>Layer</code>.
     * 
     * @property
     * @protected
     * @type { Number } 
     */
    height : null,
    
    /** 
     * Performes any needed initialization of the extension. This will be passed
     * a reference to the base <code>Layer</code> object and a set of supplied
     * configuration parameters. <code>Layer</code> should document the format
     * of the configuration properties that they expect.
     * 
     * @method configure
     * @protected
     * @param layer { IDCH.tzivi.Layer } A reference to the base 
     *      <code>Layer</code> that this object extends.
     * @param cfg { Object } Implementatoin specific configuration properties.  
     */
    configure : function(layer, cfg) { },
    
    /**
     * Indicates whether or not the <code>Layer</code> has been properly 
     * configured and is ready to be displayed. This should account for all
     * 
     * @method isReady
     * @protected
     * @return { Boolean } <code>true</code> if the <code>Layer</code> is ready
     *      to be displayed, false if it is not.
     */
    isReady : function() { },
    
    /**
     * Paints the contents of this layer to the display area at the current 
     * zoom ratio. This method should fire a <code>PAINT_EVENT</code> once the
     * content has been painted. Note that this method may be implemented 
     * asynchronously.
     * 
     * @method paint
     * @protected
     */
    paint : function() { },
    
    /**  
     * Resets the <code>Layer</code>'s content prior to painting or when hidden.
     * This should allow the layer to clean up any in process user-interaction
     * components and to ensure that any internal state that relies on the 
     * position of the display pane on the page is updated to reflect the 
     * current placement of DOM elements on the page. Note that this method 
     * should not be implemented asynchronously. It should block until any 
     * needed cleanup has been performed. Once this method returns, this object
     * should be in a state such that it is ready for a call to the 
     * <code>paint</code> method.
     * 
     * @method reset
     * @protected
     */
    reset : function() { }
};


//=============================================================================
// ZOOM CONROL
//=============================================================================

var Slider      = YAHOO.widget.Slider;
//=============================================================================
// SYMBOLIC CONSTANTS                                                
//=============================================================================
var CSS_ZC            = "pvz";     // Zoom controls
var CSS_ZC_SLIDER     = "pvzs";    // Zoom Slider
var CSS_ZC_SLIDER_BG  = "pvzsbg";  // Zoom Slider BackGround
var CSS_ZC_SLIDER_BAR = "pvzsb";   // Zoom Slider Bar
var CSS_ZC_ZOOM_IN    = "pvzi";    // Zoom In
var CSS_ZC_ZOOM_OUT   = "pvzo";    // Zoom Out
var CSS_ZC_MSG        = "pvzsm"    // Zoom Slider Message
    
var ZSLIDER = "IDCH.tzivi.ZoomSlider";
var SLIDER_THUMB_URL  = $P("idch.tzivi.sliderthumb"); 

/**
 * 
 * @class ZoomSlider
 * @namespace IDCH.tzivi
 * @param el { HTMLElement }
 * @param m_viewport { Viewport } The <code>Viewport</code> this slider will
 *      control
 * @param horizontal { Boolean } Optional flag indicating whether this 
 *      slider should be displayed horizontally or vertically. If 
 *      <code>true</code> this will be displayed horizontally, if 
 *      <code>false</code> it will be displayed vertically. Set to display
 *      vertically by default.  
 */
var ZoomSlider = function(el, m_viewport, horizontal) {
    if (horizontal !== true) horizontal = false; 
    
    //=======================================================================
    // INITIALIZATION                                                         
    //=======================================================================
    
    /**
     * Total distance (pixels) that the slider bar can move 
     * 
     * @property m_range 
     * @type Integer
     * @private
     */
    var m_range = null;
    
    /**
     * The total distance the slider can move in terms of the zoom ratio 
     * of the viewport. For example if the viewport has a max zoom level 
     * of 1 and a min zoom level of 0.1 this will be 0.9.
     *  
     * @property m_scale
     * @type Float
     * @private
     */
    var m_scale    = null;
    
    /**
     * The change in viewport ratio per slider pixel.
     * 
     * @property m_stepSize
     * @type Float
     * @private
     */
    var m_stepSize = null;
    
    /**
     * The YAHOO slider used by this ZoomSlider
     * 
     * @property m_slider
     * @type YAHOO.widget.Slider
     * @private
     */
    var m_slider   = null;
    
    /**
     * The minimum ratio allowed for the Viewport.
     * 
     * @property m_minRatio
     * @type YAHOO.widget.Slider
     * @private
     */
    var m_minRatio = null;

    /**
     * The maximum ratio allowed for the Viewport.
     * 
     * @property m_maxRatio
     * @type YAHOO.widget.Slider
     * @private
     */
    var m_maxRatio = null;
    
    /**
     * DOM element used to display information about the current state of the 
     * slider.
     * 
     * @property m_sliderMessageEl
     * @type HTMLElement
     * @private 
     */
    var m_sliderMessageEl = null;
    
    /**
     * Initializes the DOM structures, the slider and the member variables.
     * 
     * @method initSlider
     * @private
     */
    function initSlider() {
        // define the HTML structure
        var zoomEl           = $EL("div", CSS_ZC);   
        var zoomInButton     = $EL("div", CSS_ZC_ZOOM_IN);       
        var zoomOutButton    = $EL("div", CSS_ZC_ZOOM_OUT);      
        var sliderBackground = $EL("div", CSS_ZC_SLIDER_BG);  
        var sliderThumbBar   = $EL("div", CSS_ZC_SLIDER_BAR,     
                "<img src=\"" + SLIDER_THUMB_URL + "\">");
        m_sliderMessageEl    = $EL("div", CSS_ZC_MSG);           
        
        // shouldn't need id's, and this implementation is broken anyway.
        // bar.id = "barid";
        // bg.id  = "bgid";
        
        // assemble the DOM
        sliderBackground.appendChild(sliderThumbBar);
        zoomEl.appendChild(zoomInButton);
        zoomEl.appendChild(sliderBackground);
        zoomEl.appendChild(zoomOutButton);
        zoomEl.appendChild(m_sliderMessageEl);
        el.appendChild(zoomEl);
        
        // discover dimensions of slider/sliderbar
        var sld_h = dom.getStyle(sliderBackground, "height");
        var bar_h = dom.getStyle(sliderThumbBar, "height");
        
        sld_h = parseInt(sld_h.replace(/[^\d]*$/, ""));  // strip the 'px'
        bar_h = parseInt(bar_h.replace(/[^\d]*$/, ""));  // and parse
        
        m_minRatio = m_viewport.getMinRatio();
        m_maxRatio = m_viewport.getMaxRatio();
        
        m_range    = sld_h - bar_h;
        m_scale    = m_maxRatio - m_minRatio;     
        m_stepsize = m_scale / m_range;      
        
        // XXX assumes initial state is 0. We need to compute this
        // initialize slider
        m_slider   = Slider.getVertSlider(
                sliderBackground, sliderThumbBar, 0, m_range);
//        m_slider.setStartSliderState();
        
        attachListeners(zoomInButton, zoomOutButton);
        
        $info("ZoomSlider Initialized: " + m_viewport, ZSLIDER);
    }
    
    /**
     * Attaches event listeners to the various components that the slider 
     * needs to listen to.
     * 
     * @method attachListeners
     * @private
     */
    function attachListeners(zoomInButton, zoomOutButton) {
        // subscribe to slider and other events
        Event.on(zoomInButton,  "click", that.zoomIn);
        Event.on(zoomOutButton, "click", that.zoomOut);
        
        m_slider.subscribe("change",   onSliderMove);
        m_slider.subscribe("slideEnd", onSlideEnd);
        
        m_viewport.on("zoom", that.update);
        
        
        // TODO listen to "zoom"
        // TODO listen to "destroy"
        // implement destroy method.
        
        
        
    }
    
    /**
     * Handle manual sliding of the slider bar.
     * 
     *  @method onMove
     *  @private
     *  @param e { Event } The event generated by the slider.
     */
    function onSliderMove(e) {
        var offset = m_slider.getValue(); 
        var ratio = (m_scale - (m_stepsize * offset));
        var ratio = Math.round(ratio * 100) / 100;
        
        if (ratio < m_minRatio) 
            ratio = m_minRatio;
        if (ratio > m_maxRatio) 
            ratio = m_maxRatio;
        
        if (lang.isValue(m_sliderMessageEl))
            m_sliderMessageEl.innerHTML = Math.round(ratio * 100) + "%";
    }
    
    /** 
     * Handles the final update to the viewport when the user 
     * finishes dragging the slider.
     * 
     * @method onSlideEnd
     * @private
     * @param e { Event } The event generated by the slider.
     */
    function onSlideEnd(e) {
        var offset = m_slider.getValue(); 
        var ratio = (m_scale - (m_stepsize * offset));
        var ratio = Math.round(ratio * 100) / 100;
        
        if (ratio < m_minRatio) 
            ratio = m_minRatio;
        if (ratio > m_maxRatio) 
            ratio = m_maxRatio;
        
        m_viewport.setRatio(ratio);
    } 
     
    /**
     * Updates the slider's state to reflect the curren zoom ratio of the 
     * viewport.
     * 
     * @method updateSlider
     * @private
     */
    function updateSlider() {
       
    }
    
    /* ********************************************************************** *
     * The ZoomSlider Object                                                  *
     * ********************************************************************** */
    var that = {
        /**
         * Update the slider to reflect the current viewport position. 
         * 
         * @method update
         * @public 
         */
        update : function() {
            if (m_slider.isLocked()) {
                // If the slider is locked this is likely due to a prior 
                // animatition that has not finished. Defer call to update
                // so the animation has time to complete.
                lang.later(100, that, that.update);
                return;
            }
            
            var ratio = m_viewport.getRatio();
            var offset = Math.round((m_scale - ratio) / m_stepsize);
            
            m_slider.setValue(offset, false, false, true);
            
            m_sliderMessageEl.innerHTML = Math.round(ratio * 100) + "%";
            m_slider.verifyOffset();
            
            $debug("Updated Zoom Slider: " + ratio, ZSLIDER);
        },
        
        setStartState : function() {
            m_slider.setStartSliderState();
        },
        
        /**
         * Handle clicks on the zoom in button. 
         * 
         * @method zoomIn
         * @public
         */
        zoomIn : function(e) {
            var ratio = 0;
            if (e.ctrlKey) ratio = m_viewport.getRatio() + 0.01;
            else           ratio = m_viewport.getRatio() + 0.10;
            
            if (ratio > m_maxRatio) 
                ratio = m_maxRatio;
            m_viewport.setRatio(ratio);
        },
        
        /**
         * Handle clicks on the zoom out button.
         * 
         * @method zoomOut
         * @public
         */
        zoomOut : function(e) {
            var ratio = 0;
            if (e.ctrlKey) ratio = m_viewport.getRatio() - 0.01;
            else           ratio = m_viewport.getRatio() - 0.10;
            
            if (ratio < m_minRatio) 
                ratio = m_minRatio;
            m_viewport.setRatio(ratio);
        }
    };
    
    initSlider();
    m_viewport.subscribe(ZOOM_EVENT, that.update, that, true);
    
    return that;
}

//=============================================================================
// ATTACH PUBLIC OBJECTS AND PROPERTIES TO NAMESPACE
//=============================================================================

IDCH.tzivi.Viewport   = Viewport;
IDCH.tzivi.Layer      = Layer;
IDCH.tzivi.ILayerExt  = ILayerExt;
IDCH.tzivi.ZoomSlider = ZoomSlider;


YAHOO.register("tzivi", IDCH.tzivi.Viewport, 
        { version : "0.2", build : "1" });
})(); // close and invoke containing function

