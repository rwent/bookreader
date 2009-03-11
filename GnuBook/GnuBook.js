/*
Copyright(c)2008 Internet Archive. Software license AGPL version 3.

This file is part of GnuBook.

    GnuBook is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    GnuBook is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with GnuBook.  If not, see <http://www.gnu.org/licenses/>.
    
    The GnuBook source is hosted at http://github.com/openlibrary/bookreader/

    archive.org cvs $Revision: 1.68 $ $Date: 2009-03-04 22:00:31 $
*/

// GnuBook()
//______________________________________________________________________________
// After you instantiate this object, you must supply the following
// book-specific functions, before calling init():
//  - getPageWidth()
//  - getPageHeight()	
//  - getPageURI()
//  - getPageSide()
//  - getSpreadIndices()
//  - getPageNum()
// You must also add these properties, before calling init():
//  - numLeafs
//  - bookTitle
//  - bookUrl
//
// If you put multiple GnuBook instances on the same page (not in separate IFRAMEs)
// then the instances must be distinguished by distinct instance suffixes. You can
// set the instance suffix either by setting this.instanceSuffix before this.init()
// is called, or by setting GnuBook.nextInstanceSuffix prior to creating the instance.
// The default instance suffix is the empty string. 
//
// If the instance suffix is "XYZ", then the page should include a DIV with id="GnuBookXYZ"
// to hold the book viewer, and may include a search box that invokes _gbXYZ.search() and 
// a search results DIV with id="GnuBookXYZSearchResults". Note that the GnuBook instance
// saves a reference to itself in the global variable _gbXYZ.
//______________________________________________________________________________

function GnuBook() {

	// Set instance suffix based on GnuBook.nextInstanceSuffix value at time of instance creation
	// Alternatively, one could override this setting of instanceSuffix before invoking init()
	this.instanceSuffix = GnuBook.nextInstanceSuffix
	
    this.reduce  = 4;
    this.padding = 10;
    this.mode    = 1; //1 or 2
    this.pageTurnMargin = 100;
    
    this.displayedLeafs = [];	
    //this.leafsToDisplay = [];
    this.imgs = {};
    this.prefetchedImgs = {}; //an object with numeric keys cooresponding to leafNum
    
    this.timer     = null;
    this.animating = false;
    this.auto      = false;
    this.autoTimer = null;
    this.flipSpeed = 'fast';

    this.twoPageEdgePopUp = null;
    this.leafEdgeTmp  = null;
    this.embedPopup = null;
    
    this.searchResults = {};
    
    this.firstIndex = null;
    this.lastDisplayableIndex2up = null;

    this.debug = false;
};
// Instance-distinguishing suffix to be used for next-created GnuBook instance
GnuBook.nextInstanceSuffix = ''

// log() 
//  - log message to console subject to setting of this.debug
//  - even when debug is false, incurs overhead of constructing message,
//    which might matter inside a loop
//______________________________________________________________________________
GnuBook.prototype.log = function(msg) {
	if (this.debug) {
		console.log(msg);
	}
};

// getBaseDivId() - ID of DIV within which GnuBook instance lives
//______________________________________________________________________________
GnuBook.prototype.getBaseDivId = function() {
	return "GnuBook" + this.instanceSuffix;
};

// getBaseDiv() - DIV within which GnuBook instance lives
//______________________________________________________________________________
GnuBook.prototype.getBaseDiv = function() {
	return $("#" + this.getBaseDivId());
};

// getElementSelector() - Selector for element within GnuBook DIV
//______________________________________________________________________________
GnuBook.prototype.getElementSelector = function(subselector) {
	return "#" + this.getBaseDivId() + " " + subselector;
};

// getElement() - Element within GnuBook DIV
//______________________________________________________________________________
GnuBook.prototype.getElement = function(subselector) {
	return $(this.getElementSelector(subselector))
	// return $(subselector, this.getBaseDiv());
};

// getSearchResultsDiv() - DIV where search results are to appear
//______________________________________________________________________________
GnuBook.prototype.getSearchResultsDiv = function() {
	return $("#" + this.getBaseDivId() + "SearchResults");
};

// getContainerDiv() - DIV for GBcontainer
//______________________________________________________________________________
GnuBook.prototype.getContainerDiv = function() {
	return this.getElement('.GBcontainer');
};

// gbGlobalName() - Name of global variable referencing this GnuBook instance
//______________________________________________________________________________
GnuBook.prototype.gbGlobalName = function() {
	return '_gb' + this.instanceSuffix;
};


// init()
//______________________________________________________________________________
GnuBook.prototype.init = function() {

	// Set appropriate global instance variable so that we can find this object as needed
	window[this.gbGlobalName()] = this
	
    var startLeaf = window.location.hash;
    //console.log("startLeaf from location.hash: %s", startLeaf);
    if ('' == startLeaf) {
        if (this.titleLeaf) {
            startLeaf = "#" + this.leafNumToIndex(this.titleLeaf);
        }
    }
    var title = this.bookTitle.substr(0,50);
    if (this.bookTitle.length>50) title += '...';
    
    // Ideally this would be set in the HTML/PHP for better search engine visibility but
    // it takes some time to locate the item and retrieve the metadata
    document.title = title;
    
    this.getBaseDiv().empty();
    this.getBaseDiv().append("<div class='GBtoolbar'><span style='float:left;'><button class='GBicon zoom_out' onclick='"+this.gbGlobalName()+".zoomButtonHandler(-1); return false;'/> <button class='GBicon zoom_in' onclick='"+this.gbGlobalName()+".zoomButtonHandler(1); return false;'/> zoom: <span class='GBzoom'>25</span>% <button class='GBicon script' onclick='"+this.gbGlobalName()+".onePageButtonHandler(); return false;'/> <button class='GBicon book_open' onclick='"+this.gbGlobalName()+".twoPageButtonHandler(); return false;'/>  &nbsp;&nbsp; <a href='"+this.bookUrl+"' target='_blank'>"+title+"</a></span></div>");
    this.initToolbar(this.mode); // Build inside of toolbar div
    this.getBaseDiv().append("<div class='GBcontainer'></div>");
    this.addSymmetricPageTurningClickHandler(this.getContainerDiv());
    this.addGBpageview();

    this.getContainerDiv().bind('scroll', this, function(e) {
        e.data.loadLeafs();
    });

    this.setupKeyListeners();

    $(window).bind('resize', this, function(e) {
        //console.log('resize!');
        if (1 == e.data.mode) {
            //console.log('centering 1page view');
            e.data.centerPageView();
            e.data.getElement('.GBpageview').empty()
            e.data.displayedLeafs = [];
            e.data.updateSearchHilites(); //deletes hilights but does not call remove()            
            e.data.loadLeafs();
        } else {
            //console.log('drawing 2 page view');
            e.data.prepareTwoPageView();
        }
    });

    if (1 == this.mode) {
        this.resizePageView();
    
        if ('' != startLeaf) { // Jump to the leaf specified in the URL
            this.jumpToIndex(parseInt(startLeaf.substr(1)));
            //console.log('jump to ' + parseInt(startLeaf.substr(1)));
        }
    } else {
        //this.resizePageView();
        
        this.displayedLeafs=[0];
        if ('' != startLeaf) {
            this.displayedLeafs = [parseInt(startLeaf.substr(1))];
        }
        //console.log('titleLeaf: %d', this.titleLeaf);
        //console.log('displayedLeafs: %s', this.displayedLeafs);
        this.prepareTwoPageView();
        //if (this.auto) this.nextPage();
    }
}

GnuBook.prototype.setupKeyListeners = function() {
    var self = this;

    var KEY_PGUP = 33;
    var KEY_PGDOWN = 34;
    var KEY_END = 35;
    var KEY_HOME = 36;

    var KEY_LEFT = 37;
    var KEY_UP = 38;
    var KEY_RIGHT = 39;
    var KEY_DOWN = 40;

    // We use document here instead of window to avoid a bug in jQuery on IE7
    $(document).keydown(function(e) {
        
        // Keyboard navigation        
        switch(e.keyCode) {
            case KEY_PGUP:
            case KEY_UP:            
                // In 1up mode page scrolling is handled by browser
                if (2 == self.mode) {
                    self.prev();
                }
                break;
            case KEY_DOWN:
            case KEY_PGDOWN:
                if (2 == self.mode) {
                    self.next();
                }
                break;
            case KEY_END:
                self.end();
                break;
            case KEY_HOME:
                self.home();
                break;
            case KEY_LEFT:
                if (self.keyboardNavigationIsDisabled(e)) {
                    break;
                }
                if (2 == self.mode) {
                    self.left();
                }
                break;
            case KEY_RIGHT:
                if (self.keyboardNavigationIsDisabled(e)) {
                    break;
                }
                if (2 == self.mode) {
                    self.right();
                }
                break;
        }
    });
}

// drawLeafs()
//______________________________________________________________________________
GnuBook.prototype.drawLeafs = function() {
    if (1 == this.mode) {
        this.drawLeafsOnePage();
    } else {
        this.drawLeafsTwoPage();
    }
}


// drawLeafsOnePage()
//______________________________________________________________________________
GnuBook.prototype.drawLeafsOnePage = function() {
    //alert('drawing leafs!');
    this.timer = null;


    var scrollTop = this.getContainerDiv().attr('scrollTop');
    var scrollBottom = scrollTop + this.getContainerDiv().height();
    //console.log('top=' + scrollTop + ' bottom='+scrollBottom);
    
    var leafsToDisplay = [];
    
    var i;
    var leafTop = 0;
    var leafBottom = 0;
    for (i=0; i<this.numLeafs; i++) {
        var height  = this.getScaledPageHeight(i); 
    
        leafBottom += height;
        //console.log('leafTop = '+leafTop+ ' pageH = ' + this.pageH[i] + 'leafTop>=scrollTop=' + (leafTop>=scrollTop));
        var topInView    = (leafTop >= scrollTop) && (leafTop <= scrollBottom);
        var bottomInView = (leafBottom >= scrollTop) && (leafBottom <= scrollBottom);
        var middleInView = (leafTop <=scrollTop) && (leafBottom>=scrollBottom);
        if (topInView | bottomInView | middleInView) {
            //console.log('to display: ' + i);
            leafsToDisplay.push(i);
        }
        leafTop += height +10;      
        leafBottom += 10;
    }

    var firstLeafToDraw  = leafsToDisplay[0];
    window.location.replace('#' + firstLeafToDraw);
    this.firstIndex      = firstLeafToDraw;

    if ((0 != firstLeafToDraw) && (1 < this.reduce)) {
        firstLeafToDraw--;
        leafsToDisplay.unshift(firstLeafToDraw);
    }
    
    var lastLeafToDraw = leafsToDisplay[leafsToDisplay.length-1];
    if ( ((this.numLeafs-1) != lastLeafToDraw) && (1 < this.reduce) ) {
        leafsToDisplay.push(lastLeafToDraw+1);
    }
    
    leafTop = 0;
    var i;
    for (i=0; i<firstLeafToDraw; i++) {
        leafTop += this.getScaledPageHeight(i) +10;
    }

    //var viewWidth = this.getElement('.GBpageview').width(); //includes scroll bar width
    var viewWidth = this.getContainerDiv().attr('scrollWidth');


    for (i=0; i<leafsToDisplay.length; i++) {
        var leafNum = leafsToDisplay[i];    
        var height  = this.getScaledPageHeight(leafNum); 

        if(-1 == jQuery.inArray(leafsToDisplay[i], this.displayedLeafs)) {            
            var width   = this.getScaledPageWidth(leafNum); 
            //console.log("displaying leaf " + leafsToDisplay[i] + ' leafTop=' +leafTop);
            var div = document.createElement("div");
            //div.className = 'GBpagediv1up';
            //div.id = 'pagediv'+leafNum;
            div.className = 'GBpagediv1up pagediv'+leafNum;
            div.style.position = "absolute";
            $(div).css('top', leafTop + 'px');
            var left = (viewWidth-width)>>1;
            if (left<0) left = 0;
            $(div).css('left', left+'px');
            $(div).css('width', width+'px');
            $(div).css('height', height+'px');
            //$(div).text('loading...');
            
            $(div).bind('click', {'gnuBook': this, 'leafNum': leafNum}, function(e) {
				e.stopPropagation();
            	e.data.gnuBook.zoomFocus = e.data.gnuBook.focusOfEvent(this, e.data.leafNum, e);
             	e.data.gnuBook.zoom1up(1);
            });
            this.getElement('.GBpageview').append(div);

            var img = document.createElement("img");
            img.src = this.getPageURI(leafNum);
            $(img).css('width', width+'px');
            $(img).css('height', height+'px');
            $(div).append(img);

        } else {
            //console.log("not displaying " + leafsToDisplay[i] + ' score=' + jQuery.inArray(leafsToDisplay[i], this.displayedLeafs));            
        }

        leafTop += height +10;

    }
    
    for (i=0; i<this.displayedLeafs.length; i++) {
        if (-1 == jQuery.inArray(this.displayedLeafs[i], leafsToDisplay)) {
            var leafNum = this.displayedLeafs[i];
            //console.log('Removing leaf ' + leafNum);
            //console.log('id='+'.pagediv'+leafNum+ ' top = ' +this.getElement('.pagediv'+leafNum).css('top'));
            this.getElement('.pagediv'+leafNum).remove();
        } else {
            //console.log('NOT Removing leaf ' + this.displayedLeafs[i]);
        }
    }
    
    this.displayedLeafs = leafsToDisplay.slice();
    this.updateSearchHilites();
    
    if (null != this.getPageNum(firstLeafToDraw))  {
        this.getElement(".GBpagenum").val(this.getPageNum(firstLeafToDraw));
    } else {
        this.getElement(".GBpagenum").val('');
    }
}

// drawLeafsTwoPage()
//______________________________________________________________________________
GnuBook.prototype.drawLeafsTwoPage = function() {
    //alert('drawing two leafs!');

    var scrollTop = this.getContainerDiv().attr('scrollTop');
    var scrollBottom = scrollTop + this.getContainerDiv().height();
    
    //console.log('drawLeafsTwoPage: this.currrentLeafL ' + this.currentLeafL);
    
    var leafNum = this.currentLeafL;
    var height  = this.getPageHeight(leafNum); 
    var width   = this.getPageWidth(leafNum);
    var handSide= this.getPageSide(leafNum);

    var leafEdgeWidthL = this.leafEdgeWidth(leafNum);
    var leafEdgeWidthR = this.twoPageEdgeW - leafEdgeWidthL;
    var bookCoverDivWidth = this.twoPageW*2+20 + this.twoPageEdgeW;
    var bookCoverDivLeft = (this.getContainerDiv().width() - bookCoverDivWidth) >> 1;
    //console.log(leafEdgeWidthL);

    var middle = (this.getContainerDiv().width() >> 1);            
    var left = middle - this.twoPageW;
    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                

    var scaledW = parseInt(this.twoPageH*width/height);
    left = 10+leafEdgeWidthL;
    //var right = left+scaledW;
    var right = $(this.twoPageDiv).width()-11-$(this.leafEdgeL).width()-scaledW;

    var gutter = middle + this.gutterOffsetForIndex(this.currentLeafL);
    
    this.prefetchImg(leafNum);
    $(this.prefetchedImgs[leafNum]).css({
        position: 'absolute',
        /*right:   gutter+'px',*/
        left: gutter-scaledW+'px',
        right: '',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH +'px',
        width:  scaledW + 'px',
        borderRight: '1px solid black',
        zIndex: 2
    }).appendTo(this.getElementSelector('.GBcontainer'));
    //this.getContainerDiv().append(this.prefetchedImgs[leafNum]);


    var leafNum = this.currentLeafR;
    var height  = this.getPageHeight(leafNum); 
    var width   = this.getPageWidth(leafNum);
    //    var left = (this.getContainerDiv().width() >> 1);
    left += scaledW;

    var scaledW = this.twoPageH*width/height;
    this.prefetchImg(leafNum);
    $(this.prefetchedImgs[leafNum]).css({
        position: 'absolute',
        left:   gutter+'px',
        right: '',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH + 'px',
        width:  scaledW + 'px',
        borderLeft: '1px solid black',
        zIndex: 2
    }).appendTo(this.getElementSelector('.GBcontainer'));
    //this.getContainerDiv().append(this.prefetchedImgs[leafNum]);
        

    this.displayedLeafs = [this.currentLeafL, this.currentLeafR];
    this.setClickHandlers();

    this.updatePageNumBox2UP();
}

// updatePageNumBox2UP
//______________________________________________________________________________
GnuBook.prototype.updatePageNumBox2UP = function() {
    if (null != this.getPageNum(this.currentLeafL))  {
        this.getElement(".GBpagenum").val(this.getPageNum(this.currentLeafL));
    } else {
        this.getElement(".GBpagenum").val('');
    }
    window.location.replace('#' + this.currentLeafL); 
}

// loadLeafs()
//______________________________________________________________________________
GnuBook.prototype.loadLeafs = function() {


    var self = this;
    if (null == this.timer) {
        this.timer=setTimeout(function(){self.drawLeafs()},250);
    } else {
        clearTimeout(this.timer);
        this.timer=setTimeout(function(){self.drawLeafs()},250);    
    }
}

// zoomButtonHandler()
//______________________________________________________________________________
GnuBook.prototype.zoomButtonHandler = function(dir) {

	if (1 == this.mode) {
		// set zoomFocus to center of viewing area
    	var clientWidth  = this.getContainerDiv().attr('clientWidth');
    	var clientHeight  = this.getContainerDiv().attr('clientHeight');   
    	var pageViewWidth = this.getElement('.GBpageview').width();
    	var scrollWidth  = this.getContainerDiv().attr('scrollWidth');      
    	var scrollTop = this.getContainerDiv().attr('scrollTop');
    	var scrollBottom = scrollTop + this.getContainerDiv().height();
		var focusPageViewY = scrollTop + (scrollBottom - scrollTop)/2;
		var leafBottomWithPad = 0;
		var leafTop;
		for (i=0; i<this.numLeafs; i++) {
			leafTop = leafBottomWithPad;
        	leafBottomWithPad += this.getScaledPageHeight(i) + this.padding; 
        	if (leafBottomWithPad > focusPageViewY) {
        		this.zoomFocus = new this.PointInDocument({ 'leafNum': i });
        		this.zoomFocus.vert = this.ensureInRange( parseInt(1000*(focusPageViewY - leafTop)/this.getScaledPageHeight(i)), 0, 1000);
        		var focusPageViewX = this.getContainerDiv().attr('scrollLeft') + clientWidth/2;
        		//var focusPageX = focusPageViewX - (clientWidth - this.getScaledPageWidth(i))/2;
        		var focusPageX = focusPageViewX - (pageViewWidth - this.getScaledPageWidth(i))/2;
        		this.zoomFocus.horiz = this.ensureInRange( parseInt(1000*focusPageX/this.getScaledPageWidth(i)), 0, 1000);
        		this.log("zoomButtonHandler: Center is "+this.zoomFocus);
        		break;
        	}
    	}
	} else {
		// set focus near gap between pages
		this.zoomFocus = new this.PointInDocument({'leafNum': this.displayedLeafs[0],'horiz': 500});
		if (this.getPageSide(this.zoomFocus.leafNum) == 'L') {
			this.zoomFocus.vert = 1000;
		} else {
			this.zoomFocus.vert = 0;
		}
	}
	this.zoom1up(dir);
}

// zoom1up()
//______________________________________________________________________________
GnuBook.prototype.zoom1up = function(dir) {
    if (2 == this.mode) {     //can only zoom in 1-page mode
        this.switchMode(1);
        return;
    }
    
    if (1 == dir) {
        if (this.reduce > 0.5) {
        	this.reduce*=0.5;           //zoom in
        }
    	// even if zoom doesn't change, keep going to potentially re-center
    } else {
        if (this.reduce >= 8) { return; }
        this.reduce*=2;             //zoom out
    }
    
    this.resizePageView();

    this.getElement('.GBpageview').empty()
    this.displayedLeafs = [];
    this.loadLeafs();
    
    this.getElement('.GBzoom').text(100/this.reduce);
}


// resizePageView()
//______________________________________________________________________________
GnuBook.prototype.resizePageView = function() {
    var i;
    var viewHeight = 0;
    //var viewWidth  = this.getContainerDiv().width(); //includes scrollBar
    var viewWidth  = this.getContainerDiv().attr('clientWidth');   
    var clientHeight  = this.getContainerDiv().attr('clientHeight');   

    var oldScrollTop  = this.getContainerDiv().attr('scrollTop');
    var oldViewHeight = this.getElement('.GBpageview').height();
    if (0 != oldViewHeight) {
        var scrollRatio = oldScrollTop / oldViewHeight;
    } else {
        var scrollRatio = 0;
    }
    
    var focusPageViewY;
    for (i=0; i<this.numLeafs; i++) {
    	if (this.zoomFocus && (this.zoomFocus.leafNum === i)) {
    		focusPageViewY = viewHeight + parseInt(this.zoomFocus.vert * this.getScaledPageHeight(i)/1000);
    	}
        viewHeight += this.getScaledPageHeight(i) + this.padding; 
        var width = this.getScaledPageWidth(i);
        if (width>viewWidth) viewWidth=width;
    }
    
    if (focusPageViewY) {
    	var clientTop = this.ensureInRange((focusPageViewY - clientHeight/2), 0, (viewHeight - clientHeight));
    } else {
    	var clientTop = Math.floor(scrollRatio*viewHeight);
    }
    
    this.getElement('.GBpageview').height(viewHeight);
    this.getElement('.GBpageview').width(viewWidth);    

    this.getContainerDiv().attr('scrollTop', clientTop);
    
    this.centerPageView();
    this.loadLeafs();
    
}

// centerPageView()
//______________________________________________________________________________
GnuBook.prototype.centerPageView = function() {

    var scrollWidth  = this.getContainerDiv().attr('scrollWidth');
    var clientWidth  =  this.getContainerDiv().attr('clientWidth');
    //console.log('sW='+scrollWidth+' cW='+clientWidth);
    var scrollAmount;
    if (scrollWidth > clientWidth) {
    	if (this.zoomFocus) {
	    	// center on identified zoom focus
    		var pageWidth = this.getScaledPageWidth(this.zoomFocus.leafNum);
    		var focusPageX = parseInt(pageWidth*this.zoomFocus.horiz/1000);
    		var focusPageViewX = focusPageX + (scrollWidth-pageWidth)/2;
    		// center on focus
    		var scrollAmount = this.ensureInRange((focusPageViewX - clientWidth/2), 0, (scrollWidth - clientWidth)); 
    		//console.log("Centered horizontally on zoom focus");
    	} else {
    		// center on center of pages
    		scrollAmount = (scrollWidth-clientWidth)/2;
    	};
	    this.getContainerDiv().attr('scrollLeft', scrollAmount);
    }

}

// jumpToPage()
//______________________________________________________________________________
GnuBook.prototype.jumpToPage = function(pageNum) {

    var i;
    var foundPage = false;
    var foundLeaf = null;
    for (i=0; i<this.numLeafs; i++) {
        if (this.getPageNum(i) == pageNum) {
            foundPage = true;
            foundLeaf = i;
            break;
        }
    }
    
    if (foundPage) {
        var leafTop = 0;
        var h;
        this.jumpToIndex(foundLeaf);
        this.getContainerDiv().attr('scrollTop', leafTop);
    } else {
        alert('Page not found. This book might not have pageNumbers in scandata.');
    }
}

// jumpToIndex()
//______________________________________________________________________________
GnuBook.prototype.jumpToIndex = function(index) {

    if (2 == this.mode) {
        this.autoStop();
        
        // By checking against min/max we do nothing if requested index
        // is current
        if (index < Math.min(this.currentLeafL, this.currentLeafR)) {
            this.flipBackToIndex(index);
        } else if (index > Math.max(this.currentLeafL, this.currentLeafR)) {
            this.flipFwdToIndex(index);
        }

    } else {        
        var i;
        var leafTop = 0;
        var h;
        for (i=0; i<index; i++) {
            h = this.getScaledPageHeight(i); 
            leafTop += h + this.padding;
        }
        //this.getContainerDiv().attr('scrollTop', leafTop);
        this.getContainerDiv().animate({scrollTop: leafTop },'fast');    
    }
}

// onePageButtonHandler()
//______________________________________________________________________________
GnuBook.prototype.onePageButtonHandler = function() {
	this.clearZoomFocus();
	this.switchMode(1);
}

// twoPageButtonHandler()
//______________________________________________________________________________
GnuBook.prototype.twoPageButtonHandler = function() {
	this.switchMode(2);
}


// switchMode()
//______________________________________________________________________________
GnuBook.prototype.switchMode = function(mode) {

    //console.log('  asked to switch to mode ' + mode + ' from ' + this.mode);
    
    if (mode == this.mode) return;

    this.autoStop();
    this.removeSearchHilites();

    this.mode = mode;
    
    this.switchToolbarMode(mode);
    
    if (1 == mode) {
        this.prepareOnePageView();
    } else {
        this.prepareTwoPageView();
    }

}

//prepareOnePageView()
//______________________________________________________________________________
GnuBook.prototype.prepareOnePageView = function() {

    var startLeaf = this.displayedLeafs[0];
    
    this.getContainerDiv().empty();
    this.getContainerDiv().css({
        overflowY: 'scroll',
        overflowX: 'auto'
    });
    
    this.addGBpageview();

    this.resizePageView();
    if (! this.zoomFocus) {
    	this.log("prepareOnePageView: startLeaf="+startLeaf);
    	this.jumpToIndex(startLeaf);
    }
    this.displayedLeafs = [];    
    this.drawLeafsOnePage();
    this.getElement('.GBzoom').text(100/this.reduce);    
}

// prepareTwoPageView()
//______________________________________________________________________________
GnuBook.prototype.prepareTwoPageView = function() {
    this.getContainerDiv().empty();

    // We want to display two facing pages.  We may be missing
    // one side of the spread because it is the first/last leaf,
    // foldouts, missing pages, etc

    var targetLeaf = this.displayedLeafs[0];
    
    if (targetLeaf < this.firstDisplayableIndex()) {
        targetLeaf = this.firstDisplayableIndex();
    }
    
    if (targetLeaf > this.lastDisplayableIndex()) {
        targetLeaf = this.lastDisplayableIndex();
    }
    
    this.currentLeafL = null;
    this.currentLeafR = null;
    this.pruneUnusedImgs();
    
    var currentSpreadIndices = this.getSpreadIndices(targetLeaf);
    this.currentLeafL = currentSpreadIndices[0];
    this.currentLeafR = currentSpreadIndices[1];
    
    this.calculateSpreadSize(); //sets this.twoPageW, twoPageH, and twoPageRatio

    // We want to minimize the unused space in two-up mode (maximize the amount of page
    // shown).  We give width to the leaf edges and these widths change (though the sum
    // of the two remains constant) as we flip through the book.  With the book
    // cover centered and fixed in the GBcontainer div the page images will meet
    // at the "gutter" which is generally offset from the center.
    var middle = (this.getContainerDiv().width() >> 1); // Middle of the GBcontainer div
    //var gutter = middle+parseInt((2*this.currentLeafL - this.numLeafs)*this.twoPageEdgeW/this.numLeafs/2);
    
    var gutter = middle + this.gutterOffsetForIndex(this.currentLeafL);
    
    var scaledWL = this.getPageWidth2UP(this.currentLeafL);
    var scaledWR = this.getPageWidth2UP(this.currentLeafR);
    var leafEdgeWidthL = this.leafEdgeWidth(this.currentLeafL);
    var leafEdgeWidthR = this.twoPageEdgeW - leafEdgeWidthL;

    //console.log('idealWidth='+idealWidth+' idealHeight='+idealHeight);
    //var bookCoverDivWidth = this.twoPageW*2+20 + this.twoPageEdgeW;
    
    // The width of the book cover div.  The combined width of both pages, twice the width
    // of the book cover internal padding (2*10) and the page edges
    var bookCoverDivWidth = scaledWL + scaledWR + 20 + this.twoPageEdgeW;
    
    // The height of the book cover div
    var bookCoverDivHeight = this.twoPageH+20;
    
    //var bookCoverDivLeft = ($('#GBcontainer').width() - bookCoverDivWidth) >> 1;
    var bookCoverDivLeft = gutter-scaledWL-leafEdgeWidthL-10;
    var bookCoverDivTop = (this.getContainerDiv().height() - bookCoverDivHeight) >> 1;
    //console.log('bookCoverDivWidth='+bookCoverDivWidth+' bookCoverDivHeight='+bookCoverDivHeight+ ' bookCoverDivLeft='+bookCoverDivLeft+' bookCoverDivTop='+bookCoverDivTop);

    this.twoPageDiv = document.createElement('div');
    $(this.twoPageDiv).attr('id', 'book_div_1').css({
        border: '1px solid rgb(68, 25, 17)',
        width:  bookCoverDivWidth + 'px',
        height: bookCoverDivHeight+'px',
        visibility: 'visible',
        position: 'absolute',
        backgroundColor: 'rgb(136, 51, 34)',
        left: bookCoverDivLeft + 'px',
        top: bookCoverDivTop+'px',
        MozBorderRadiusTopleft: '7px',
        MozBorderRadiusTopright: '7px',
        MozBorderRadiusBottomright: '7px',
        MozBorderRadiusBottomleft: '7px'
    }).appendTo(this.getElementSelector('.GBcontainer'));
    //this.getContainerDiv().append('<div id="book_div_1" style="border: 1px solid rgb(68, 25, 17); width: ' + divWidth + 'px; height: '+divHeight+'px; visibility: visible; position: absolute; background-color: rgb(136, 51, 34); left: ' + divLeft + 'px; top: '+divTop+'px; -moz-border-radius-topleft: 7px; -moz-border-radius-topright: 7px; -moz-border-radius-bottomright: 7px; -moz-border-radius-bottomleft: 7px;"/>');


    var height  = this.getPageHeight(this.currentLeafR); 
    var width   = this.getPageWidth(this.currentLeafR);    
    var scaledW = this.twoPageH*width/height;
    
    this.leafEdgeR = document.createElement('div');
    this.leafEdgeR.className = 'leafEdgeR';
    $(this.leafEdgeR).css({
        borderStyle: 'solid solid solid none',
        borderColor: 'rgb(51, 51, 34)',
        borderWidth: '1px 1px 1px 0px',
        background: 'transparent url(images/right-edges.png) repeat scroll 0% 0%',
        width: leafEdgeWidthR + 'px',
        height: this.twoPageH-1 + 'px',
        /*right: '10px',*/
        left: gutter+scaledW+'px',
        top: bookCoverDivTop+10+'px',
        position: 'absolute'
    }).appendTo(this.getElementSelector('.GBcontainer'));
    
    this.leafEdgeL = document.createElement('div');
    this.leafEdgeL.className = 'leafEdgeL';
    $(this.leafEdgeL).css({
        borderStyle: 'solid none solid solid',
        borderColor: 'rgb(51, 51, 34)',
        borderWidth: '1px 0px 1px 1px',
        background: 'transparent url(images/left-edges.png) repeat scroll 0% 0%',
        width: leafEdgeWidthL + 'px',
        height: this.twoPageH-1 + 'px',
        left: bookCoverDivLeft+10+'px',
        top: bookCoverDivTop+10+'px',    
        position: 'absolute'
    }).appendTo(this.getElementSelector('.GBcontainer'));

    bookCoverDivWidth = 30;
    bookCoverDivHeight = this.twoPageH+20;
    bookCoverDivLeft = (this.getContainerDiv().width() - bookCoverDivWidth) >> 1;
    bookCoverDivTop = (this.getContainerDiv().height() - bookCoverDivHeight) >> 1;

    div = document.createElement('div');
    $(div).attr('id', 'book_div_2').css({
        border:          '1px solid rgb(68, 25, 17)',
        width:           bookCoverDivWidth+'px',
        height:          bookCoverDivHeight+'px',
        position:        'absolute',
        backgroundColor: 'rgb(68, 25, 17)',
        left:            bookCoverDivLeft+'px',
        top:             bookCoverDivTop+'px'
    }).appendTo(this.getElementSelector('.GBcontainer'));
    //this.getContainerDiv().append('<div id="book_div_2" style="border: 1px solid rgb(68, 25, 17); width: '+bookCoverDivWidth+'px; height: '+bookCoverDivHeight+'px; visibility: visible; position: absolute; background-color: rgb(68, 25, 17); left: '+bookCoverDivLeft+'px; top: '+bookCoverDivTop+'px;"/>');

    bookCoverDivWidth = this.twoPageW*2;
    bookCoverDivHeight = this.twoPageH;
    bookCoverDivLeft = (this.getContainerDiv().width() - bookCoverDivWidth) >> 1;
    bookCoverDivTop = (this.getContainerDiv().height() - bookCoverDivHeight) >> 1;

    this.preparePageEdgePopUp();

    this.displayedLeafs = [];
    
    //this.leafsToDisplay=[firstLeaf, firstLeaf+1];
    //console.log('leafsToDisplay: ' + this.leafsToDisplay[0] + ' ' + this.leafsToDisplay[1]);
    
    this.drawLeafsTwoPage();
    this.updateSearchHilites2UP();
    
    this.prefetch();
    this.getElement('.GBzoom').text((100*this.twoPageH/this.getPageHeight(this.currentLeafL)).toString().substr(0,4));
}

// preparePageEdgePopUp()
//
// This function prepares the "View leaf n" popup that shows while the mouse is
// over the left/right "stack of sheets" edges.  It also binds the mouse
// events for these divs.
//______________________________________________________________________________
GnuBook.prototype.preparePageEdgePopUp = function() {
    this.twoPageEdgePopUp = document.createElement('div');
    $(this.twoPageEdgePopUp).css({
        border: '1px solid black',
        padding: '2px 6px',
        position: 'absolute',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        zIndex: '1000',
        backgroundColor: 'rgb(255, 255, 238)',
        opacity: 0.85
    }).appendTo(this.getElementSelector('.GBcontainer'));
    $(this.twoPageEdgePopUp).hide();
    
    $(this.leafEdgeL).add(this.leafEdgeR).bind('mouseenter', this, function(e) {
        $(e.data.twoPageEdgePopUp).show();
    });

    $(this.leafEdgeL).add(this.leafEdgeR).bind('mouseleave', this, function(e) {
        $(e.data.twoPageEdgePopUp).hide();
    });

    $(this.leafEdgeL).bind('click', this, function(e) { 
    	e.stopPropagation();
        e.data.autoStop();
        var jumpIndex = e.data.jumpIndexForLeftEdgePageX(e.pageX);
        e.data.jumpToIndex(jumpIndex);
    });

    $(this.leafEdgeR).bind('click', this, function(e) { 
    	e.stopPropagation();
        e.data.autoStop();
        var jumpIndex = e.data.jumpIndexForRightEdgePageX(e.pageX);
        e.data.jumpToIndex(jumpIndex);    
    });

    $(this.leafEdgeR).bind('mousemove', this, function(e) {

        var jumpLeaf = e.data.jumpIndexForRightEdgePageX(e.pageX);
        $(e.data.twoPageEdgePopUp).text('View Leaf '+jumpLeaf);
        
        $(e.data.twoPageEdgePopUp).css({
            left: e.pageX +5+ 'px',
            top: e.pageY-e.data.getContainerDiv().offset().top+ 'px'
        });
    });

    $(this.leafEdgeL).bind('mousemove', this, function(e) {
    
        var jumpLeaf = e.data.jumpIndexForLeftEdgePageX(e.pageX);
        $(e.data.twoPageEdgePopUp).text('View Leaf '+jumpLeaf);
        
        $(e.data.twoPageEdgePopUp).css({
            left: e.pageX - $(e.data.twoPageEdgePopUp).width() - 30 + 'px',
            top: e.pageY-e.data.getContainerDiv().offset().top+ 'px'
        });
    });
}

// calculateSpreadSize()
//______________________________________________________________________________
// Calculates 2-page spread dimensions based on this.currentLeafL and
// this.currentLeafR
// This function sets this.twoPageH, twoPageW, and twoPageRatio

GnuBook.prototype.calculateSpreadSize = function() {
    var firstLeaf  = this.currentLeafL;
    var secondLeaf = this.currentLeafR;
    //console.log('first page is ' + firstLeaf);

    var canon5Dratio = 1.5;
    
    var firstLeafRatio  = this.getPageHeight(firstLeaf) / this.getPageWidth(firstLeaf);
    var secondLeafRatio = this.getPageHeight(secondLeaf) / this.getPageWidth(secondLeaf);
    //console.log('firstLeafRatio = ' + firstLeafRatio + ' secondLeafRatio = ' + secondLeafRatio);

    var ratio;
    if (Math.abs(firstLeafRatio - canon5Dratio) < Math.abs(secondLeafRatio - canon5Dratio)) {
        ratio = firstLeafRatio;
        //console.log('using firstLeafRatio ' + ratio);
    } else {
        ratio = secondLeafRatio;
        //console.log('using secondLeafRatio ' + ratio);
    }

    var totalLeafEdgeWidth = parseInt(this.numLeafs * 0.1);
    var maxLeafEdgeWidth   = parseInt(this.getContainerDiv().width() * 0.1);
    totalLeafEdgeWidth     = Math.min(totalLeafEdgeWidth, maxLeafEdgeWidth);
    
    this.getContainerDiv().css('overflow', 'hidden');

    var idealWidth  = (this.getContainerDiv().width() - 30 - totalLeafEdgeWidth)>>1;
    var idealHeight = this.getContainerDiv().height() - 30;
    //console.log('init idealWidth='+idealWidth+' idealHeight='+idealHeight + ' ratio='+ratio);

    if (idealHeight/ratio <= idealWidth) {
        //use height
        idealWidth = parseInt(idealHeight/ratio);
    } else {
        //use width
        idealHeight = parseInt(idealWidth*ratio);
    }

    this.twoPageH     = idealHeight;
    this.twoPageW     = idealWidth;
    this.twoPageRatio = ratio;
    this.twoPageEdgeW = totalLeafEdgeWidth; // The combined width of both edges

}

// right()
//______________________________________________________________________________
// Flip the right page over onto the left
GnuBook.prototype.right = function() {
    if ('rl' != this.pageProgression) {
        // LTR
        this.next();
    } else {
        // RTL
        this.prev();
    }
}

// left()
//______________________________________________________________________________
// Flip the left page over onto the right.
GnuBook.prototype.left = function() {
    if ('rl' != this.pageProgression) {
        // LTR
        this.prev();
    } else {
        // RTL
        this.next();
    }
}

// next()
//______________________________________________________________________________
GnuBook.prototype.next = function() {
    if (2 == this.mode) {
        this.autoStop();
        this.flipFwdToIndex(null);
    } else {
        if (this.firstIndex < this.lastDisplayableIndex()) {
            this.jumpToIndex(this.firstIndex+1);
        }
    }
}

// prev()
//______________________________________________________________________________
GnuBook.prototype.prev = function() {
    if (2 == this.mode) {
        this.autoStop();
        this.flipBackToIndex(null);
    } else {
        if (this.firstIndex >= 1) {
            this.jumpToIndex(this.firstIndex-1);
        }    
    }
}

GnuBook.prototype.home = function() {
    if (2 == this.mode) {
        this.jumpToIndex(2);
    }
    else {
        this.jumpToIndex(0);
    }
}

GnuBook.prototype.end = function() {
    if (2 == this.mode) {
        this.jumpToIndex(this.lastDisplayableIndex());
    }
    else {
        this.jumpToIndex(this.lastDisplayableIndex());
    }
}

// flipBackToIndex()
//______________________________________________________________________________
// to flip back one spread, pass index=null
GnuBook.prototype.flipBackToIndex = function(index) {
    if (1 == this.mode) return;

    var leftIndex = this.currentLeafL;
    
    // $$$ Need to change this to be able to see first spread.
    //     See https://bugs.launchpad.net/gnubook/+bug/296788
    if (leftIndex <= 2) return;
    if (this.animating) return;

    if (null != this.leafEdgeTmp) {
        alert('error: leafEdgeTmp should be null!');
        return;
    }
    
    if (null == index) {
        index = leftIndex-2;
    }
    //if (index<0) return;
    
    var previousIndices = this.getSpreadIndices(index);
    
    if (previousIndices[0] < 0 || previousIndices[1] < 0) {
        return;
    }
    
    //console.log("flipping back to " + previousIndices[0] + ',' + previousIndices[1]);

    this.animating = true;
    
    if ('rl' != this.pageProgression) {
        // Assume LTR and we are going backward    
        var gutter = this.prepareFlipLeftToRight(previousIndices[0], previousIndices[1]);        
        this.flipLeftToRight(previousIndices[0], previousIndices[1], gutter);
        
    } else {
        // RTL and going backward
        var gutter = this.prepareFlipRightToLeft(previousIndices[0], previousIndices[1]);
        this.flipRightToLeft(previousIndices[0], previousIndices[1], gutter);
    }
}

// flipLeftToRight()
//______________________________________________________________________________
// Flips the page on the left towards the page on the right
GnuBook.prototype.flipLeftToRight = function(newIndexL, newIndexR, gutter) {

    var leftLeaf = this.currentLeafL;
    
    var oldLeafEdgeWidthL = this.leafEdgeWidth(this.currentLeafL);
    var newLeafEdgeWidthL = this.leafEdgeWidth(newIndexL);    
    var leafEdgeTmpW = oldLeafEdgeWidthL - newLeafEdgeWidthL;
    
    var currWidthL   = this.getPageWidth2UP(leftLeaf);
    var newWidthL    = this.getPageWidth2UP(newIndexL);
    var newWidthR    = this.getPageWidth2UP(newIndexR);

    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                

    //console.log('leftEdgeTmpW ' + leafEdgeTmpW);
    //console.log('  gutter ' + gutter + ', scaledWL ' + scaledWL + ', newLeafEdgeWL ' + newLeafEdgeWidthL);
    
    //animation strategy:
    // 0. remove search highlight, if any.
    // 1. create a new div, called leafEdgeTmp to represent the leaf edge between the leftmost edge 
    //    of the left leaf and where the user clicked in the leaf edge.
    //    Note that if this function was triggered by left() and not a
    //    mouse click, the width of leafEdgeTmp is very small (zero px).
    // 2. animate both leafEdgeTmp to the gutter (without changing its width) and animate
    //    leftLeaf to width=0.
    // 3. When step 2 is finished, animate leafEdgeTmp to right-hand side of new right leaf
    //    (left=gutter+newWidthR) while also animating the new right leaf from width=0 to
    //    its new full width.
    // 4. After step 3 is finished, do the following:
    //      - remove leafEdgeTmp from the dom.
    //      - resize and move the right leaf edge (leafEdgeR) to left=gutter+newWidthR
    //          and width=twoPageEdgeW-newLeafEdgeWidthL.
    //      - resize and move the left leaf edge (leafEdgeL) to left=gutter-newWidthL-newLeafEdgeWidthL
    //          and width=newLeafEdgeWidthL.
    //      - resize the back cover (twoPageDiv) to left=gutter-newWidthL-newLeafEdgeWidthL-10
    //          and width=newWidthL+newWidthR+twoPageEdgeW+20
    //      - move new left leaf (newIndexL) forward to zindex=2 so it can receive clicks.
    //      - remove old left and right leafs from the dom [pruneUnusedImgs()].
    //      - prefetch new adjacent leafs.
    //      - set up click handlers for both new left and right leafs.
    //      - redraw the search highlight.
    //      - update the pagenum box and the url.
    
    
    var leftEdgeTmpLeft = gutter - currWidthL - leafEdgeTmpW;

    this.leafEdgeTmp = document.createElement('div');
    $(this.leafEdgeTmp).css({
        borderStyle: 'solid none solid solid',
        borderColor: 'rgb(51, 51, 34)',
        borderWidth: '1px 0px 1px 1px',
        background: 'transparent url(images/left-edges.png) repeat scroll 0% 0%',
        width: leafEdgeTmpW + 'px',
        height: this.twoPageH-1 + 'px',
        left: leftEdgeTmpLeft + 'px',
        top: top+'px',    
        position: 'absolute',
        zIndex:1000
    }).appendTo(this.getElementSelector('.GBcontainer'));
    
    //$(this.leafEdgeL).css('width', newLeafEdgeWidthL+'px');
    $(this.leafEdgeL).css({
        width: newLeafEdgeWidthL+'px', 
        left: gutter-currWidthL-newLeafEdgeWidthL+'px'
    });   

    // Left gets the offset of the current left leaf from the document
    var left = $(this.prefetchedImgs[leftLeaf]).offset().left;
    // $$$ This seems very similar to the gutter.  May be able to consolidate the logic.
    var right = this.getContainerDiv().width()-left-$(this.prefetchedImgs[leftLeaf]).width()+this.getContainerDiv().offset().left-2+'px';
    // We change the left leaf to right positioning
    $(this.prefetchedImgs[leftLeaf]).css({
        right: right,
        left: ''
    });

     left = $(this.prefetchedImgs[leftLeaf]).offset().left - $('#book_div_1').offset().left;
     
     right = left+$(this.prefetchedImgs[leftLeaf]).width()+'px';

    $(this.leafEdgeTmp).animate({left: gutter}, this.flipSpeed, 'easeInSine');    
    //$(this.prefetchedImgs[leftLeaf]).animate({width: '0px'}, 'slow', 'easeInSine');
    
    var self = this;

    this.removeSearchHilites();

    //console.log('animating leafLeaf ' + leftLeaf + ' to 0px');
    $(this.prefetchedImgs[leftLeaf]).animate({width: '0px'}, self.flipSpeed, 'easeInSine', function() {
    
        //console.log('     and now leafEdgeTmp to left: gutter+newWidthR ' + (gutter + newWidthR));
        $(self.leafEdgeTmp).animate({left: gutter+newWidthR+'px'}, self.flipSpeed, 'easeOutSine');

        //console.log('  animating newIndexR ' + newIndexR + ' to ' + newWidthR + ' from ' + $(self.prefetchedImgs[newIndexR]).width());
        $(self.prefetchedImgs[newIndexR]).animate({width: newWidthR+'px'}, self.flipSpeed, 'easeOutSine', function() {
            $(self.prefetchedImgs[newIndexL]).css('zIndex', 2);

            $(self.leafEdgeR).css({
                // Moves the right leaf edge
                width: self.twoPageEdgeW-newLeafEdgeWidthL+'px',
                left:  gutter+newWidthR+'px'
            });

            $(self.leafEdgeL).css({
                // Moves and resizes the left leaf edge
                width: newLeafEdgeWidthL+'px',
                left:  gutter-newWidthL-newLeafEdgeWidthL+'px'
            });

            
            $(self.twoPageDiv).css({
                // Resizes the brown border div
                width: newWidthL+newWidthR+self.twoPageEdgeW+20+'px',
                left: gutter-newWidthL-newLeafEdgeWidthL-10+'px'
            });
            
            $(self.leafEdgeTmp).remove();
            self.leafEdgeTmp = null;
            
            self.currentLeafL = newIndexL;
            self.currentLeafR = newIndexR;
            self.displayedLeafs = [newIndexL, newIndexR];
            self.setClickHandlers();
            self.pruneUnusedImgs();
            self.prefetch();
            self.animating = false;
            
            self.updateSearchHilites2UP();
            self.updatePageNumBox2UP();
            //this.getElement('.GBzoom').text((self.twoPageH/self.getPageHeight(prevL)).toString().substr(0,4));            
        });
    });        
    
}

// flipFwdToIndex()
//______________________________________________________________________________
// Whether we flip left or right is dependent on the page progression
// to flip forward one spread, pass index=null
GnuBook.prototype.flipFwdToIndex = function(index) {

    if (this.animating) return;

    if (null != this.leafEdgeTmp) {
        alert('error: leafEdgeTmp should be null!');
        return;
    }

    if (null == index) {
        index = this.currentLeafR+2; // $$$ assumes indices are continuous
    }
    if (index > this.lastDisplayableIndex()) return;

    this.animating = true;
    
    var nextIndices = this.getSpreadIndices(index);
    
    //console.log('flipfwd to indices ' + nextIndices[0] + ',' + nextIndices[1]);

    if ('rl' != this.pageProgression) {
        // We did not specify RTL
        var gutter = this.prepareFlipRightToLeft(nextIndices[0], nextIndices[1]);
        this.flipRightToLeft(nextIndices[0], nextIndices[1], gutter);
    } else {
        // RTL
        var gutter = this.prepareFlipLeftToRight(nextIndices[0], nextIndices[1]);
        this.flipLeftToRight(nextIndices[0], nextIndices[1], gutter);
    }
}

// flipRightToLeft(nextL, nextR, gutter)
// $$$ better not to have to pass gutter in
//______________________________________________________________________________
// Flip from left to right and show the nextL and nextR indices on those sides
GnuBook.prototype.flipRightToLeft = function(newIndexL, newIndexR, gutter) {
    var oldLeafEdgeWidthL = this.leafEdgeWidth(this.currentLeafL);
    var oldLeafEdgeWidthR = this.twoPageEdgeW-oldLeafEdgeWidthL;
    var newLeafEdgeWidthL = this.leafEdgeWidth(newIndexL);  
    var newLeafEdgeWidthR = this.twoPageEdgeW-newLeafEdgeWidthL;

    var leafEdgeTmpW = oldLeafEdgeWidthR - newLeafEdgeWidthR;

    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                

    var scaledW = this.getPageWidth2UP(this.currentLeafR);

    var middle     = (this.getContainerDiv().width() >> 1);
    var currGutter = middle + this.gutterOffsetForIndex(this.currentLeafL);

    this.leafEdgeTmp = document.createElement('div');
    $(this.leafEdgeTmp).css({
        borderStyle: 'solid none solid solid',
        borderColor: 'rgb(51, 51, 34)',
        borderWidth: '1px 0px 1px 1px',
        background: 'transparent url(images/left-edges.png) repeat scroll 0% 0%',
        width: leafEdgeTmpW + 'px',
        height: this.twoPageH-1 + 'px',
        left: currGutter+scaledW+'px',
        top: top+'px',    
        position: 'absolute',
        zIndex:1000
    }).appendTo(this.getElementSelector('.GBcontainer'));

    //var scaledWR = this.getPageWidth2UP(newIndexR); // $$$ should be current instead?
    //var scaledWL = this.getPageWidth2UP(newIndexL); // $$$ should be current instead?
    
    var currWidthL = this.getPageWidth2UP(this.currentLeafL);
    var currWidthR = this.getPageWidth2UP(this.currentLeafR);
    var newWidthL = this.getPageWidth2UP(newIndexL);
    var newWidthR = this.getPageWidth2UP(newIndexR);

    $(this.leafEdgeR).css({width: newLeafEdgeWidthR+'px', left: gutter+newWidthR+'px' });

    var self = this; // closure-tastic!

    var speed = this.flipSpeed;

    this.removeSearchHilites();
    
    $(this.leafEdgeTmp).animate({left: gutter}, speed, 'easeInSine');    
    $(this.prefetchedImgs[this.currentLeafR]).animate({width: '0px'}, speed, 'easeInSine', function() {
        $(self.leafEdgeTmp).animate({left: gutter-newWidthL-leafEdgeTmpW+'px'}, speed, 'easeOutSine');    
        $(self.prefetchedImgs[newIndexL]).animate({width: newWidthL+'px'}, speed, 'easeOutSine', function() {
            $(self.prefetchedImgs[newIndexR]).css('zIndex', 2);

            $(self.leafEdgeL).css({
                width: newLeafEdgeWidthL+'px', 
                left: gutter-newWidthL-newLeafEdgeWidthL+'px'
            });
            
            $(self.twoPageDiv).css({
                width: newWidthL+newWidthR+self.twoPageEdgeW+20+'px',
                left: gutter-newWidthL-newLeafEdgeWidthL-10+'px'
            });
            
            $(self.leafEdgeTmp).remove();
            self.leafEdgeTmp = null;
            
            self.currentLeafL = newIndexL;
            self.currentLeafR = newIndexR;
            self.displayedLeafs = [newIndexL, newIndexR];
            self.setClickHandlers();            
            self.pruneUnusedImgs();
            self.prefetch();
            self.animating = false;

            self.updateSearchHilites2UP();
            self.updatePageNumBox2UP();
            //this.getElement('.GBzoom').text((self.twoPageH/self.getPageHeight(nextL)).toString().substr(0,4));
        });
    });    
}

// setClickHandlers
//______________________________________________________________________________
GnuBook.prototype.setClickHandlers = function() {

	// define variables to be used via closure
    var self = this;
    var localLeafL = this.currentLeafL;
    var localLeafR = this.currentLeafR;
    
    $(this.prefetchedImgs[this.currentLeafL]).click(function(e) {
    	var focus = self.focusOfEvent(this, localLeafL, e);
    	if (focus.horiz < self.pageTurnMargin) {	// turn page
        	//self.prevPage();
        	self.autoStop();
        	self.left();
        } else {	// zoom
        	self.zoomFocus = focus;
        	self.zoom1up(1);
        }
    });
    $(this.prefetchedImgs[this.currentLeafR]).click(function(e) {
   		var focus = self.focusOfEvent(this, localLeafR, e);
    	if (focus.horiz > (1000 - self.pageTurnMargin)) {	// turn page
        	//self.nextPage();'
        	self.autoStop();
        	self.right();        
        } else {	// zoom
        	self.zoomFocus = focus;
        	self.zoom1up(1);
        }
    });
}

// prefetchImg()
//______________________________________________________________________________
GnuBook.prototype.prefetchImg = function(leafNum) {
    if (undefined == this.prefetchedImgs[leafNum]) {    
        //console.log('prefetching ' + leafNum);
        var img = document.createElement("img");
        img.src = this.getPageURI(leafNum);
        this.prefetchedImgs[leafNum] = img;
    }
}


// prepareFlipLeftToRight()
//
//______________________________________________________________________________
//
// Prepare to flip the left page towards the right.  This corresponds to moving
// backward when the page progression is left to right.
GnuBook.prototype.prepareFlipLeftToRight = function(prevL, prevR) {

    //console.log('  preparing left->right for ' + prevL + ',' + prevR);

    this.prefetchImg(prevL);
    this.prefetchImg(prevR);
    
    var height  = this.getPageHeight(prevL); 
    var width   = this.getPageWidth(prevL);    
    var middle = (this.getContainerDiv().width() >> 1);
    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                
    var scaledW = this.twoPageH*width/height;

    // The gutter is the dividing line between the left and right pages.
    // It is offset from the middle to create the illusion of thickness to the pages
    var gutter = middle + this.gutterOffsetForIndex(prevL);
    
    //console.log('    gutter for ' + prevL + ' is ' + gutter);
    //console.log('    prevL.left: ' + (gutter - scaledW) + 'px');
    //console.log('    changing prevL ' + prevL + ' to left: ' + (gutter-scaledW) + ' width: ' + scaledW);
    
    $(this.prefetchedImgs[prevL]).css({
        position: 'absolute',
        /*right:   middle+'px',*/
        left: gutter-scaledW+'px',
        right: '',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH,
        width:  scaledW+'px',
        borderRight: '1px solid black',
        zIndex: 1
    });

    this.getContainerDiv().append(this.prefetchedImgs[prevL]);

    //console.log('    changing prevR ' + prevR + ' to left: ' + gutter + ' width: 0');

    $(this.prefetchedImgs[prevR]).css({
        position: 'absolute',
        left:   gutter+'px',
        right: '',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH,
        width:  '0px',
        borderLeft: '1px solid black',
        zIndex: 2
    });

    this.getContainerDiv().append(this.prefetchedImgs[prevR]);


    return gutter;
            
}

// prepareFlipRightToLeft()
//______________________________________________________________________________
GnuBook.prototype.prepareFlipRightToLeft = function(nextL, nextR) {

    //console.log('  preparing left<-right for ' + nextL + ',' + nextR);

    this.prefetchImg(nextL);
    this.prefetchImg(nextR);

    var height  = this.getPageHeight(nextR); 
    var width   = this.getPageWidth(nextR);    
    var middle = (this.getContainerDiv().width() >> 1);
    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                
    var scaledW = this.twoPageH*width/height;

    var gutter = middle + this.gutterOffsetForIndex(nextL);
    
    //console.log('right to left to %d gutter is %d', nextL, gutter);
    
    //console.log(' prepareRTL changing nextR ' + nextR + ' to left: ' + gutter);
    $(this.prefetchedImgs[nextR]).css({
        position: 'absolute',
        left:   gutter+'px',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH,
        width:  scaledW+'px',
        borderLeft: '1px solid black',
        zIndex: 1
    });

    this.getContainerDiv().append(this.prefetchedImgs[nextR]);

    height  = this.getPageHeight(nextL); 
    width   = this.getPageWidth(nextL);      
    scaledW = this.twoPageH*width/height;

    //console.log(' prepareRTL changing nextL ' + nextL + ' to right: ' + $('#GBcontainer').width()-gutter);
    $(this.prefetchedImgs[nextL]).css({
        position: 'absolute',
        right:   this.getContainerDiv().width()-gutter+'px',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH,
        width:  0+'px',
        borderRight: '1px solid black',
        zIndex: 2
    });

    this.getContainerDiv().append(this.prefetchedImgs[nextL]);    

    return gutter;
            
}

// getNextLeafs() -- NOT RTL AWARE
//______________________________________________________________________________
// GnuBook.prototype.getNextLeafs = function(o) {
//     //TODO: we might have two left or two right leafs in a row (damaged book)
//     //For now, assume that leafs are contiguous.
//     
//     //return [this.currentLeafL+2, this.currentLeafL+3];
//     o.L = this.currentLeafL+2;
//     o.R = this.currentLeafL+3;
// }

// getprevLeafs() -- NOT RTL AWARE
//______________________________________________________________________________
// GnuBook.prototype.getPrevLeafs = function(o) {
//     //TODO: we might have two left or two right leafs in a row (damaged book)
//     //For now, assume that leafs are contiguous.
//     
//     //return [this.currentLeafL-2, this.currentLeafL-1];
//     o.L = this.currentLeafL-2;
//     o.R = this.currentLeafL-1;
// }

// pruneUnusedImgs()
//______________________________________________________________________________
GnuBook.prototype.pruneUnusedImgs = function() {
    //console.log('current: ' + this.currentLeafL + ' ' + this.currentLeafR);
    for (var key in this.prefetchedImgs) {
        //console.log('key is ' + key);
        if ((key != this.currentLeafL) && (key != this.currentLeafR)) {
            //console.log('removing key '+ key);
            $(this.prefetchedImgs[key]).remove();
        }
        if ((key < this.currentLeafL-4) || (key > this.currentLeafR+4)) {
            //console.log('deleting key '+ key);
            delete this.prefetchedImgs[key];
        }
    }
}

// prefetch()
//______________________________________________________________________________
GnuBook.prototype.prefetch = function() {

    var lim = this.currentLeafL-4;
    var i;
    lim = Math.max(lim, 0);
    for (i = lim; i < this.currentLeafL; i++) {
        this.prefetchImg(i);
    }
    
    if (this.numLeafs > (this.currentLeafR+1)) {
        lim = Math.min(this.currentLeafR+4, this.numLeafs-1);
        for (i=this.currentLeafR+1; i<=lim; i++) {
            this.prefetchImg(i);
        }
    }
}

// getPageWidth2UP()
//______________________________________________________________________________
GnuBook.prototype.getPageWidth2UP = function(index) {
    var height  = this.getPageHeight(index); 
    var width   = this.getPageWidth(index);    
    return Math.floor(this.twoPageH*width/height);
}    

// search()
//______________________________________________________________________________
GnuBook.prototype.search = function(term) {
    $('#' + this.getBaseDivId() + 'SearchScript').remove();
 	var script  = document.createElement("script");
 	script.setAttribute('id', this.getBaseDivId() + 'SearchScript');
	script.setAttribute("type", "text/javascript");
	script.setAttribute("src", 'http://'+this.server+'/GnuBook/flipbook_search_gb.php?url='+escape(this.bookPath+'/'+this.bookId+'_djvu.xml')+'&term='+term+'&format=XML&callback='+this.gbGlobalName()+'.GBSearchCallback');
	document.getElementsByTagName('head')[0].appendChild(script);
}

// GBSearchCallback()
//______________________________________________________________________________
GnuBook.prototype.GBSearchCallback = function(txt) {
    //alert(txt);
    if (jQuery.browser.msie) {
        var dom=new ActiveXObject("Microsoft.XMLDOM");
        dom.async="false";
        dom.loadXML(txt);    
    } else {
        var parser = new DOMParser();
        var dom = parser.parseFromString(txt, "text/xml");    
    }
    
    this.getSearchResultsDiv().empty();    
    this.getSearchResultsDiv().append('<ul>');
    
    for (var key in this.searchResults) {
        if (null != this.searchResults[key].div) {
            $(this.searchResults[key].div).remove();
        }
        delete this.searchResults[key];
    }
    
    var pages = dom.getElementsByTagName('PAGE');
    
    if (0 == pages.length) {
        // $$$ it would be nice to echo the (sanitized) search result here
        this.getSearchResultsDiv().append('<li>No search results found</li>');
    } else {    
        for (var i = 0; i < pages.length; i++){
            //console.log(pages[i].getAttribute('file').substr(1) +'-'+ parseInt(pages[i].getAttribute('file').substr(1), 10));
    
            
            var re = new RegExp (/_(\d{4})/);
            var reMatch = re.exec(pages[i].getAttribute('file'));
            var leafNum = parseInt(reMatch[1], 10);
            //var leafNum = parseInt(pages[i].getAttribute('file').substr(1), 10);
            
            var children = pages[i].childNodes;
            var context = '';
            for (var j=0; j<children.length; j++) {
                //console.log(j + ' - ' + children[j].nodeName);
                //console.log(children[j].firstChild.nodeValue);
                if ('CONTEXT' == children[j].nodeName) {
                    context += children[j].firstChild.nodeValue;
                } else if ('WORD' == children[j].nodeName) {
                    context += '<b>'+children[j].firstChild.nodeValue+'</b>';
                    
                    var index = this.leafNumToIndex(leafNum);
                    if (null != index) {
                        //coordinates are [left, bottom, right, top, [baseline]]
                        //we'll skip baseline for now...
                        var coords = children[j].getAttribute('coords').split(',',4);
                        if (4 == coords.length) {
                            this.searchResults[index] = {'l':coords[0], 'b':coords[1], 'r':coords[2], 't':coords[3], 'div':null};
                        }
                    }
                }
            }
            this.getSearchResultsDiv().append('<li><b><a href="javascript:'+this.gbGlobalName()+'.jumpToIndex('+index+');">Leaf ' + leafNum + '</a></b> - ' + context+'</li>');
        }
    }
    this.getSearchResultsDiv().append('</ul>');

    this.updateSearchHilites();
}

// updateSearchHilites()
//______________________________________________________________________________
GnuBook.prototype.updateSearchHilites = function() {
    if (2 == this.mode) {
        this.updateSearchHilites2UP();
    } else {
        this.updateSearchHilites1UP();
    }
}

// showSearchHilites1UP()
//______________________________________________________________________________
GnuBook.prototype.updateSearchHilites1UP = function() {

    for (var key in this.searchResults) {
        
        if (-1 != jQuery.inArray(parseInt(key), this.displayedLeafs)) {
            var result = this.searchResults[key];
            if(null == result.div) {
                result.div = document.createElement('div');
                $(result.div).attr('className', 'GnuBookSearchHilite').appendTo(this.getElementSelector('.pagediv'+key));
                //console.log('appending ' + key);
            }    
            $(result.div).css({
                width:  (result.r-result.l)/this.reduce + 'px',
                height: (result.b-result.t)/this.reduce + 'px',
                left:   (result.l)/this.reduce + 'px',
                top:    (result.t)/this.reduce +'px'
            });

        } else {
            //console.log(key + ' not displayed');
            this.searchResults[key].div=null;
        }
    }
}

// showSearchHilites2UP()
//______________________________________________________________________________
GnuBook.prototype.updateSearchHilites2UP = function() {

    var middle = (this.getContainerDiv().width() >> 1);

    for (var key in this.searchResults) {
        key = parseInt(key, 10);
        if (-1 != jQuery.inArray(key, this.displayedLeafs)) {
            var result = this.searchResults[key];
            if(null == result.div) {
                result.div = document.createElement('div');
                $(result.div).attr('className', 'GnuBookSearchHilite').css('zIndex', 3).appendTo(this.getElementSelector('.GBcontainer'));
                //console.log('appending ' + key);
            }

            var height = this.getPageHeight(key);
            var width  = this.getPageWidth(key)
            var reduce = this.twoPageH/height;
            var scaledW = parseInt(width*reduce);
            
            var gutter = middle + this.gutterOffsetForIndex(this.currentLeafL);
            
            if ('L' == this.getPageSide(key)) {
                var pageL = gutter-scaledW;
            } else {
                var pageL = gutter;
            }
            var pageT  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                
                        
            $(result.div).css({
                width:  (result.r-result.l)*reduce + 'px',
                height: (result.b-result.t)*reduce + 'px',
                left:   pageL+(result.l)*reduce + 'px',
                top:    pageT+(result.t)*reduce +'px'
            });

        } else {
            //console.log(key + ' not displayed');
            if (null != this.searchResults[key].div) {
                //console.log('removing ' + key);
                $(this.searchResults[key].div).remove();
            }
            this.searchResults[key].div=null;
        }
    }
}

// removeSearchHilites()
//______________________________________________________________________________
GnuBook.prototype.removeSearchHilites = function() {
    for (var key in this.searchResults) {
        if (null != this.searchResults[key].div) {
            $(this.searchResults[key].div).remove();
            this.searchResults[key].div=null;
        }        
    }
}

// showEmbedCode()
//______________________________________________________________________________
GnuBook.prototype.showEmbedCode = function() {
    if (null != this.embedPopup) { // check if already showing
        return;
    }
    this.autoStop();
    this.embedPopup = document.createElement("div");
    $(this.embedPopup).css({
        position: 'absolute',
        top:      '20px',
        left:     (this.getContainerDiv().width()-400)/2 + 'px',
        width:    '400px',
        padding:  "20px",
        border:   "3px double #999999",
        zIndex:   3,
        backgroundColor: "#fff"
    }).appendTo(this.getElementSelector(''));

    htmlStr =  '<p style="text-align:center;"><b>Embed Bookreader in your blog!</b></p>';
    htmlStr += '<p><b>Note:</b> The bookreader is still in beta testing. URLs may change in the future, breaking embedded books. This feature is just for testing!</b></p>';
    htmlStr += '<p>The bookreader uses iframes for embedding. It will not work on web hosts that block iframes. The embed feature has been tested on blogspot.com blogs as well as self-hosted Wordpress blogs. This feature will NOT work on wordpress.com blogs.</p>';
    htmlStr += '<p>Embed Code: <input type="text" size="40" value="<iframe src=\'http://www.us.archive.org/GnuBook/GnuBookEmbed.php?id='+this.bookId+'\' width=\'430px\' height=\'430px\'></iframe>"></p>';
    htmlStr += '<p style="text-align:center;"><a href="" onclick="'+this.gbGlobalName()+'.embedPopup = null; $(this.parentNode.parentNode).remove(); return false">Close popup</a></p>';    

    this.embedPopup.innerHTML = htmlStr;    
}

// autoToggle()
//______________________________________________________________________________
GnuBook.prototype.autoToggle = function() {

    var bComingFrom1up = false;
    if (2 != this.mode) {
        bComingFrom1up = true;
        this.switchMode(2);
    }

    var self = this;
    if (null == this.autoTimer) {
        this.flipSpeed = 2000;
        
        // $$$ Draw events currently cause layout problems when they occur during animation.
        //     There is a specific problem when changing from 1-up immediately to autoplay in RTL so
        //     we workaround for now by not triggering immediate animation in that case.
        //     See https://bugs.launchpad.net/gnubook/+bug/328327
        if (('rl' == this.pageProgression) && bComingFrom1up) {
            // don't flip immediately -- wait until timer fires
        } else {
            // flip immediately
            this.flipFwdToIndex();        
        }

        this.getElement('.autoImg').removeClass('play').addClass('pause');
        this.autoTimer=setInterval(function(){
            if (self.animating) {return;}
            
            if (Math.max(self.currentLeafL, self.currentLeafR) >= self.lastDisplayableIndex()) {
                self.flipBackToIndex(1); // $$$ really what we want?
            } else {            
                self.flipFwdToIndex();
            }
        },5000);
    } else {
        this.autoStop();
    }
}

// autoStop()
//______________________________________________________________________________
GnuBook.prototype.autoStop = function() {
    if (null != this.autoTimer) {
        clearInterval(this.autoTimer);
        this.flipSpeed = 'fast';
        $('.autoImg').removeClass('pause').addClass('play');
        this.autoTimer = null;
    }
}

// keyboardNavigationIsDisabled(event)
//   - returns true if keyboard navigation should be disabled for the event
//______________________________________________________________________________
GnuBook.prototype.keyboardNavigationIsDisabled = function(event) {
    if (event.target.tagName == "INPUT") {
        return true;
    }   
    return false;
}

// getReducedPageWidth(), getScaledPageHeight()
//  - page size after scaling is applied
//______________________________________________________________________________
GnuBook.prototype.getScaledPageWidth = function(leafNum) {
	return parseInt(this.getPageWidth(leafNum)/this.reduce);
}

GnuBook.prototype.getScaledPageHeight = function(leafNum) {
	return parseInt(this.getPageHeight(leafNum)/this.reduce);
}

// ensureInRange()
//______________________________________________________________________________
GnuBook.prototype.ensureInRange = function(x, low, high) {
	return Math.min(high, Math.max(low, x));
}

// PointInDocument() constructor
//  - Object to facilitate printing of location
//______________________________________________________________________________

GnuBook.prototype.PointInDocument = function(keys) {
	this.leafNum = null;
	this.horiz = null;
	this.vert = null;
	if (keys) {
		if (keys.leafNum || (keys.leafNum === 0)) { this.leafNum = keys.leafNum; };
		if (keys.horiz || (keys.horiz === 0)) { this.horiz = keys.horiz; };
		if (keys.vert || (keys.vert === 0)) { this.vert = keys.vert; };
	}
}
GnuBook.prototype.PointInDocument.prototype.toString = function() {
	return '[leafNum=' + this.leafNum + ', horiz=' + this.horiz + ', vert=' + this.vert + ']';
}

// focusOfEvent()
//______________________________________________________________________________
GnuBook.prototype.focusOfEvent = function(pageDiv, leafNum, e) {
    jqPageDiv = $(pageDiv);
   	var focus = new this.PointInDocument({
            		'leafNum': leafNum,
            		'horiz': parseInt(1000*(e.pageX - jqPageDiv.offset().left)/jqPageDiv.width()),
            		'vert':  parseInt(1000*(e.pageY - jqPageDiv.offset().top)/jqPageDiv.height()) });
    this.log("Focus of event = "+focus);
    return focus;
}

// clearZoomFocus()
//______________________________________________________________________________
GnuBook.prototype.clearZoomFocus = function() {
	this.zoomFocus = null;
	this.log("Clear zoomFocus");
}

// addGBpageview()
//______________________________________________________________________________
GnuBook.prototype.addGBpageview = function() {

    this.getContainerDiv().append("<div class='GBpageview'></div>");

	this.getElement('.GBpageview').bind('click', this, function(e) {
    	e.stopPropagation();
    	e.data.log('GBpageview clicked');
		e.data.switchMode(2);
	});	
}

// addSymmetricPageTurningClickHandler()
//______________________________________________________________________________
GnuBook.prototype.addSymmetricPageTurningClickHandler = function(element) {
	var self = this;
	element.click(function(e) {
		if (self.mode == 2) {
        	self.autoStop();
			if (e.pageX > $(this).width()/2) {
				self.right();
			} else {
	        	self.left();
			}
		}
	});
}

// gutterOffsetForIndex
//______________________________________________________________________________
//
// Returns the gutter offset for the spread containing the given index.
// This function supports RTL
GnuBook.prototype.gutterOffsetForIndex = function(pindex) {

    // To find the offset of the gutter from the middle we calculate our percentage distance
    // through the book (0..1), remap to (-0.5..0.5) and multiply by the total page edge width
    var offset = parseInt(((pindex / this.numLeafs) - 0.5) * this.twoPageEdgeW);
    
    // But then again for RTL it's the opposite
    if ('rl' == this.pageProgression) {
        offset = -offset;
    }
    
    return offset;
}

// leafEdgeWidth
//______________________________________________________________________________
// Returns the width of the leaf edge div for the page with index given
GnuBook.prototype.leafEdgeWidth = function(pindex) {
    // $$$ could there be single pixel rounding errors for L vs R?
    if ((this.getPageSide(pindex) == 'L') && (this.pageProgression != 'rl')) {
        return parseInt( (pindex/this.numLeafs) * this.twoPageEdgeW + 0.5);
    } else {
        return parseInt( (1 - pindex/this.numLeafs) * this.twoPageEdgeW + 0.5);
    }
}

// jumpIndexForLeftEdgePageX
//______________________________________________________________________________
// Returns the target jump leaf given a page coordinate (inside the left page edge div)
GnuBook.prototype.jumpIndexForLeftEdgePageX = function(pageX) {
    if ('rl' != this.pageProgression) {
        // LTR - flipping backward
        var jumpLeaf = this.currentLeafL - ($(this.leafEdgeL).offset().left + $(this.leafEdgeL).width() - pageX) * 10;
        // browser may have resized the div due to font size change -- see https://bugs.launchpad.net/gnubook/+bug/333570
        jumpLeaf = Math.min(jumpLeaf, this.currentLeafL - 2);
        jumpLeaf = Math.max(jumpLeaf, this.firstDisplayableIndex());
        return jumpLeaf;
    } else {
        var jumpLeaf = this.currentLeafL + ($(this.leafEdgeL).offset().left + $(this.leafEdgeL).width() - pageX) * 10;
        jumpLeaf = Math.max(jumpLeaf, this.currentLeafL + 2);
        jumpLeaf = Math.min(jumpLeaf, this.lastDisplayableIndex());
        return jumpLeaf;
    }
}

// jumpIndexForRightEdgePageX
//______________________________________________________________________________
// Returns the target jump leaf given a page coordinate (inside the right page edge div)
GnuBook.prototype.jumpIndexForRightEdgePageX = function(pageX) {
    if ('rl' != this.pageProgression) {
        // LTR
        var jumpLeaf = this.currentLeafR + (pageX - $(this.leafEdgeR).offset().left) * 10;
        jumpLeaf = Math.max(jumpLeaf, this.currentLeafR + 2);
        jumpLeaf = Math.min(jumpLeaf, this.lastDisplayableIndex());
        return jumpLeaf;
    } else {
        var jumpLeaf = this.currentLeafR - (pageX - $(this.leafEdgeR).offset().left) * 10;
        jumpLeaf = Math.min(jumpLeaf, this.currentLeafR - 2);
        jumpLeaf = Math.max(jumpLeaf, this.firstDisplayableIndex());
        return jumpLeaf;
    }
}

GnuBook.prototype.initToolbar = function(mode) {
    // $$$ turn this into a member variable
    var jToolbar = this.getElement('.GBtoolbar'); // j prefix indicates jQuery object
    var self = this;
    
    // We build in mode 2
    jToolbar.append("<span id='GBtoolbarbuttons' style='float: right'><button class='GBicon page_code' /><form class='GBpageform' action='javascript:' onsubmit='"+this.gbGlobalName()+".jumpToPage(this.elements[0].value)'> page:<input class='GBpagenum' type='text' size='3' onfocus='"+this.gbGlobalName()+".autoStop();'></input></form> <button class='GBicon book_left'/> <button class='GBicon book_right' /> <button class='GBicon play autoImg' /></span>");

    // Bind the non-changing click handlers
    jToolbar.find('.page_code').bind('click', function(e) {
        self.showEmbedCode();
        return false;
    });
    jToolbar.find('.play').bind('click', function(e) {
        self.autoToggle();
        return false;
    });

    // Switch to requested mode -- binds other click handlers
    this.switchToolbarMode(mode);

}


// switchToolbarMode
//______________________________________________________________________________
// Update the toolbar for the given mode (changes navigation buttons)
// $$$ we should soon split the toolbar out into its own module
GnuBook.prototype.switchToolbarMode = function(mode) {
    if (1 == mode) {
        // 1-up        
      	this.getElement('.GBtoolbar .GBicon.book_left').removeClass('book_left').addClass('book_up');
        this.getElement('.GBtoolbar .GBicon.book_right').removeClass('book_right').addClass('book_down');
    } else {
        // 2-up
        this.getElement('.GBtoolbar .GBicon.book_up').removeClass('book_up').addClass('book_left');
        this.getElement('.GBtoolbar .GBicon.book_down').removeClass('book_down').addClass('book_right');
    }
    
    this.bindToolbarNavHandlers(this.getElement('.GBtoolbar'));
}

GnuBook.prototype.bindToolbarHandlers = function(jToolbar) {

}

// bindToolbarNavHandlers
//______________________________________________________________________________
// Binds the toolbar handlers
GnuBook.prototype.bindToolbarNavHandlers = function(jToolbar) {

    // $$$ TODO understand why an anonymous function is required instead of just
    //          setting handler to e.g. gb.prev
    
    var self = this;

    jToolbar.find('.book_left').unbind('click')
        .bind('click', function(e) {
            self.left();
            return false;
         });
         
    jToolbar.find('.book_right').unbind('click')
        .bind('click', function(e) {
            self.right();
            return false;
        });
        
    jToolbar.find('.book_up').unbind('click')
        .bind('click', function(e) {
            self.prev();
            return false;
        });        
        
    jToolbar.find('.book_down').unbind('click')
        .bind('click', function(e) {
            self.next();
            return false;
        });      
}

// firstDisplayableIndex
//______________________________________________________________________________
// Returns the index of the first visible page, dependent on the mode.
// $$$ Currently we cannot display the front/back cover in 2-up and will need to update
// this function when we can as part of https://bugs.launchpad.net/gnubook/+bug/296788
GnuBook.prototype.firstDisplayableIndex = function() {
    if (this.mode == 0) {
        return 0;
    } else {
        return 1; // $$$ we assume there are enough pages... we need logic for very short books
    }
}

// lastDisplayableIndex
//______________________________________________________________________________
// Returns the index of the last visible page, dependent on the mode.
// $$$ Currently we cannot display the front/back cover in 2-up and will need to update
// this function when we can as pa  rt of https://bugs.launchpad.net/gnubook/+bug/296788
GnuBook.prototype.lastDisplayableIndex = function() {
    if (this.mode == 2) {
        if (this.lastDisplayableIndex2up === null) {
            // Calculate and cache
            var candidate = this.numLeafs - 1;
            for ( ; candidate >= 0; candidate--) {
                var spreadIndices = this.getSpreadIndices(candidate);
                if (Math.max(spreadIndices[0], spreadIndices[1]) < (this.numLeafs - 1)) {
                    break;
                }
            }
            this.lastDisplayableIndex2up = candidate;
        }
        return this.lastDisplayableIndex2up;
    } else {
        return this.numLeafs - 1;
    }
}
